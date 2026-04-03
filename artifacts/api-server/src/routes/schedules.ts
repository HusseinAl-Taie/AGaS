import { Router, type IRouter } from "express";
import cron from "node-cron";
import { db, scheduledTriggersTable, agentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { scheduleJob, unscheduleJob, computeNextRunAt } from "../lib/scheduler";

const router: IRouter = Router();

router.get("/schedules", requireAuth, async (req, res): Promise<void> => {
  const schedules = await db
    .select()
    .from(scheduledTriggersTable)
    .where(eq(scheduledTriggersTable.tenantId, req.tenantId));

  res.json({ schedules });
});

router.post("/schedules", requireAuth, async (req, res): Promise<void> => {
  const { agentId, cronExpression, inputTemplate = {}, enabled = true } = req.body;

  if (!agentId || !cronExpression) {
    res.status(400).json({ error: "agentId and cronExpression are required" });
    return;
  }

  if (!cron.validate(cronExpression as string)) {
    res.status(400).json({ error: "Invalid cron expression" });
    return;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const nextRunAt = computeNextRunAt(cronExpression);

  const [schedule] = await db
    .insert(scheduledTriggersTable)
    .values({ agentId, tenantId: req.tenantId, cronExpression, inputTemplate, enabled, nextRunAt: nextRunAt ?? undefined })
    .returning();

  // Register with cron engine if enabled
  if (schedule.enabled) {
    scheduleJob(schedule.id, schedule.cronExpression);
  }

  res.status(201).json(schedule);
});

router.put("/schedules/:scheduleId", requireAuth, async (req, res): Promise<void> => {
  const scheduleId = Array.isArray(req.params.scheduleId) ? req.params.scheduleId[0] : req.params.scheduleId;

  const [existing] = await db
    .select()
    .from(scheduledTriggersTable)
    .where(and(eq(scheduledTriggersTable.id, scheduleId), eq(scheduledTriggersTable.tenantId, req.tenantId)));

  if (!existing) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  const updates: Partial<typeof scheduledTriggersTable.$inferInsert> = {};
  if (req.body.cronExpression !== undefined) {
    if (!cron.validate(req.body.cronExpression as string)) {
      res.status(400).json({ error: "Invalid cron expression" });
      return;
    }
    updates.cronExpression = req.body.cronExpression;
    // Recompute nextRunAt when cron expression changes
    const nextRunAt = computeNextRunAt(req.body.cronExpression as string);
    if (nextRunAt) updates.nextRunAt = nextRunAt;
  }
  if (req.body.inputTemplate !== undefined) updates.inputTemplate = req.body.inputTemplate;
  if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;

  const [schedule] = await db
    .update(scheduledTriggersTable)
    .set(updates)
    .where(and(eq(scheduledTriggersTable.id, scheduleId), eq(scheduledTriggersTable.tenantId, req.tenantId)))
    .returning();

  // Sync cron engine with new state
  if (schedule.enabled) {
    scheduleJob(schedule.id, schedule.cronExpression);
  } else {
    unscheduleJob(schedule.id);
  }

  res.json(schedule);
});

router.delete("/schedules/:scheduleId", requireAuth, async (req, res): Promise<void> => {
  const scheduleId = Array.isArray(req.params.scheduleId) ? req.params.scheduleId[0] : req.params.scheduleId;

  const [schedule] = await db
    .delete(scheduledTriggersTable)
    .where(and(eq(scheduledTriggersTable.id, scheduleId), eq(scheduledTriggersTable.tenantId, req.tenantId)))
    .returning();

  if (!schedule) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  // Remove from cron engine
  unscheduleJob(scheduleId);

  res.json(schedule);
});

export default router;
