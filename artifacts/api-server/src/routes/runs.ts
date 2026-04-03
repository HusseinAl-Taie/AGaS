import { Router, type IRouter } from "express";
import { db, agentRunsTable, agentsTable, runStatusEnum } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { enqueueAgentRun } from "../lib/queue";
import { publishRunEvent } from "../lib/runEvents";
import { enqueueWebhookDeliveries } from "../lib/webhookQueue";

type RunStatus = (typeof runStatusEnum.enumValues)[number];

const router: IRouter = Router();

router.get("/runs", requireAuth, async (req, res): Promise<void> => {
  const { agentId, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(agentRunsTable.tenantId, req.tenantId)];
  if (agentId) conditions.push(eq(agentRunsTable.agentId, agentId));
  if (status && (runStatusEnum.enumValues as readonly string[]).includes(status)) {
    conditions.push(eq(agentRunsTable.status, status as RunStatus));
  }

  const [runs, totalResult] = await Promise.all([
    db
      .select()
      .from(agentRunsTable)
      .where(and(...conditions))
      .orderBy(desc(agentRunsTable.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ count: count() })
      .from(agentRunsTable)
      .where(and(...conditions)),
  ]);

  res.json({ runs, total: totalResult[0]?.count ?? 0 });
});

router.get("/runs/:runId", requireAuth, async (req, res): Promise<void> => {
  const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;

  const [run] = await db
    .select()
    .from(agentRunsTable)
    .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.tenantId, req.tenantId)));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, run.agentId));

  res.json({ ...run, steps: run.steps ?? [], agent });
});

router.post("/runs/:runId/approve", requireAuth, async (req, res): Promise<void> => {
  const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;

  const [run] = await db
    .select()
    .from(agentRunsTable)
    .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.tenantId, req.tenantId)));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  if (run.status !== "awaiting_approval") {
    res.status(400).json({ error: "Run is not awaiting approval" });
    return;
  }

  const [updated] = await db
    .update(agentRunsTable)
    .set({ status: "running" })
    .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.tenantId, req.tenantId)))
    .returning();

  // Re-enqueue the run job with a unique jobId so BullMQ does not deduplicate
  // against the original job (which completed when the run first paused).
  await enqueueAgentRun(
    { runId: updated.id, agentId: updated.agentId, tenantId: updated.tenantId },
    { isResume: true }
  );

  res.json(updated);
});

router.post("/runs/:runId/cancel", requireAuth, async (req, res): Promise<void> => {
  const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;

  const [run] = await db
    .select()
    .from(agentRunsTable)
    .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.tenantId, req.tenantId)));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const cancellableStatuses: RunStatus[] = ["queued", "running", "awaiting_approval"];
  if (!cancellableStatuses.includes(run.status)) {
    res.status(400).json({ error: "Run cannot be cancelled in its current state" });
    return;
  }

  const [updated] = await db
    .update(agentRunsTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.tenantId, req.tenantId)))
    .returning();

  // Notify SSE subscribers about cancellation
  await publishRunEvent(runId, {
    type: "done",
    payload: { status: "cancelled", runId },
  }).catch(() => {/* non-critical — Redis may not have subscribers */});

  // Trigger webhook delivery for run.cancelled event
  await enqueueWebhookDeliveries({
    tenantId: req.tenantId,
    agentId: updated.agentId,
    runId,
    event: "run.cancelled",
    payload: { status: "cancelled" },
  }).catch(() => {/* non-critical — webhook queue failure should not fail the cancel response */});

  res.json(updated);
});

export default router;
