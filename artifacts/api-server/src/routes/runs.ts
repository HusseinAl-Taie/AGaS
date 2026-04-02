import { Router, type IRouter } from "express";
import { db, agentRunsTable, agentsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/runs", requireAuth, async (req, res): Promise<void> => {
  const { agentId, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(agentRunsTable.tenantId, req.tenantId)];
  if (agentId) conditions.push(eq(agentRunsTable.agentId, agentId));
  if (status) conditions.push(eq(agentRunsTable.status, status as any));

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
    .where(eq(agentRunsTable.id, runId))
    .returning();

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

  const cancellableStatuses = ["queued", "running", "awaiting_approval"];
  if (!cancellableStatuses.includes(run.status)) {
    res.status(400).json({ error: "Run cannot be cancelled in its current state" });
    return;
  }

  const [updated] = await db
    .update(agentRunsTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(agentRunsTable.id, runId))
    .returning();

  res.json(updated);
});

export default router;
