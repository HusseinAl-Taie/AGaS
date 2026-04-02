import { Router, type IRouter } from "express";
import { db, agentsTable, agentRunsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/agents", requireAuth, async (req, res): Promise<void> => {
  const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(agentsTable.tenantId, req.tenantId)];
  if (status) {
    conditions.push(eq(agentsTable.status, status as any));
  }

  const [agents, totalResult] = await Promise.all([
    db
      .select()
      .from(agentsTable)
      .where(and(...conditions))
      .orderBy(desc(agentsTable.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ count: count() })
      .from(agentsTable)
      .where(and(...conditions)),
  ]);

  res.json({ agents, total: totalResult[0]?.count ?? 0 });
});

router.post("/agents", requireAuth, async (req, res): Promise<void> => {
  const {
    name,
    description = "",
    systemPrompt = "",
    model = "claude-sonnet-4-20250514",
    tools = [],
    maxSteps = 20,
    maxBudgetCents = 100,
    approvalMode = "auto",
  } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [agent] = await db
    .insert(agentsTable)
    .values({
      tenantId: req.tenantId,
      name,
      description,
      systemPrompt,
      model,
      tools,
      maxSteps,
      maxBudgetCents,
      approvalMode,
    })
    .returning();

  res.status(201).json(agent);
});

router.get("/agents/:agentId", requireAuth, async (req, res): Promise<void> => {
  const agentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json(agent);
});

router.put("/agents/:agentId", requireAuth, async (req, res): Promise<void> => {
  const agentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;

  const [existing] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)));

  if (!existing) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const updates: Partial<typeof agentsTable.$inferInsert> = {};
  const fields = ["name", "description", "systemPrompt", "model", "tools", "maxSteps", "maxBudgetCents", "approvalMode", "status"];
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      (updates as any)[field] = req.body[field];
    }
  }

  const [agent] = await db
    .update(agentsTable)
    .set(updates)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)))
    .returning();

  res.json(agent);
});

router.delete("/agents/:agentId", requireAuth, async (req, res): Promise<void> => {
  const agentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;

  const [agent] = await db
    .update(agentsTable)
    .set({ status: "archived" })
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json(agent);
});

router.post("/agents/:agentId/run", requireAuth, async (req, res): Promise<void> => {
  const agentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const { input = {}, trigger = "manual" } = req.body;

  const [run] = await db
    .insert(agentRunsTable)
    .values({
      agentId,
      tenantId: req.tenantId,
      trigger,
      input,
      status: "queued",
    })
    .returning();

  res.status(201).json(run);
});

export default router;
