import cron, { type ScheduledTask } from "node-cron";
import { CronExpressionParser } from "cron-parser";
import { db, scheduledTriggersTable, agentRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { enqueueAgentRun } from "./queue";

const activeTasks = new Map<string, ScheduledTask>();

function makeRunInput(inputTemplate: unknown): Record<string, unknown> {
  if (inputTemplate && typeof inputTemplate === "object" && !Array.isArray(inputTemplate)) {
    return inputTemplate as Record<string, unknown>;
  }
  return {};
}

/**
 * Compute the next fire time for a cron expression using cron-parser.
 * Returns null if the expression is invalid or unparseable.
 */
export function computeNextRunAt(cronExpr: string, after: Date = new Date()): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { currentDate: after });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

async function fireSchedule(scheduleId: string): Promise<void> {
  const [schedule] = await db
    .select()
    .from(scheduledTriggersTable)
    .where(eq(scheduledTriggersTable.id, scheduleId));

  if (!schedule || !schedule.enabled) return;

  logger.info({ scheduleId, agentId: schedule.agentId }, "Firing scheduled trigger");

  const [run] = await db
    .insert(agentRunsTable)
    .values({
      agentId: schedule.agentId,
      tenantId: schedule.tenantId,
      status: "queued",
      trigger: "schedule",
      input: makeRunInput(schedule.inputTemplate),
      steps: [],
      totalTokens: 0,
      costCents: 0,
    })
    .returning();

  await enqueueAgentRun({
    runId: run.id,
    agentId: schedule.agentId,
    tenantId: schedule.tenantId,
  });

  // Compute and persist actual next fire time (not "now")
  const nextRunAt = computeNextRunAt(schedule.cronExpression);
  await db
    .update(scheduledTriggersTable)
    .set({ nextRunAt: nextRunAt ?? undefined })
    .where(eq(scheduledTriggersTable.id, scheduleId));
}

export function scheduleJob(scheduleId: string, cronExpr: string): void {
  if (activeTasks.has(scheduleId)) {
    activeTasks.get(scheduleId)!.stop();
  }

  if (!cron.validate(cronExpr)) {
    logger.warn({ scheduleId, cronExpr }, "Invalid cron expression — skipping");
    return;
  }

  const task = cron.schedule(cronExpr, () => {
    fireSchedule(scheduleId).catch((err) => {
      logger.error({ scheduleId, err }, "Scheduled trigger failed");
    });
  });

  activeTasks.set(scheduleId, task);
  logger.info({ scheduleId, cronExpr }, "Cron job scheduled");
}

export function unscheduleJob(scheduleId: string): void {
  const task = activeTasks.get(scheduleId);
  if (task) {
    task.stop();
    activeTasks.delete(scheduleId);
    logger.info({ scheduleId }, "Cron job removed");
  }
}

export async function initScheduler(): Promise<void> {
  const schedules = await db
    .select()
    .from(scheduledTriggersTable)
    .where(eq(scheduledTriggersTable.enabled, true));

  for (const s of schedules) {
    scheduleJob(s.id, s.cronExpression);

    // Backfill nextRunAt if missing
    if (!s.nextRunAt) {
      const nextRunAt = computeNextRunAt(s.cronExpression);
      if (nextRunAt) {
        await db
          .update(scheduledTriggersTable)
          .set({ nextRunAt })
          .where(eq(scheduledTriggersTable.id, s.id));
      }
    }
  }

  logger.info({ count: schedules.length }, "Scheduler initialized");
}
