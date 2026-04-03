import { Router, type IRouter } from "express";
import { db, agentsTable, agentRunsTable, tenantsTable } from "@workspace/db";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { enqueueAgentRun } from "../lib/queue";

const CONCURRENT_RUN_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  enterprise: Infinity,
};

type AgentStatus = "active" | "paused" | "archived";

const router: IRouter = Router();

router.get("/agents", requireAuth, async (req, res): Promise<void> => {
  const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(agentsTable.tenantId, req.tenantId)];
  const validStatuses: AgentStatus[] = ["active", "paused", "archived"];
  if (status && validStatuses.includes(status as AgentStatus)) {
    conditions.push(eq(agentsTable.status, status as AgentStatus));
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
    model = "claude-sonnet-4-6",
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

  type AgentInsert = typeof agentsTable.$inferInsert;
  const updates: Partial<AgentInsert> = {};
  if (req.body.name !== undefined) updates.name = req.body.name as AgentInsert["name"];
  if (req.body.description !== undefined) updates.description = req.body.description as AgentInsert["description"];
  if (req.body.systemPrompt !== undefined) updates.systemPrompt = req.body.systemPrompt as AgentInsert["systemPrompt"];
  if (req.body.model !== undefined) updates.model = req.body.model as AgentInsert["model"];
  if (req.body.tools !== undefined) updates.tools = req.body.tools as AgentInsert["tools"];
  if (req.body.maxSteps !== undefined) updates.maxSteps = req.body.maxSteps as AgentInsert["maxSteps"];
  if (req.body.maxBudgetCents !== undefined) updates.maxBudgetCents = req.body.maxBudgetCents as AgentInsert["maxBudgetCents"];
  if (req.body.approvalMode !== undefined) updates.approvalMode = req.body.approvalMode as AgentInsert["approvalMode"];
  if (req.body.status !== undefined) {
    const validAgentStatuses: AgentStatus[] = ["active", "paused", "archived"];
    if (validAgentStatuses.includes(req.body.status as AgentStatus)) {
      updates.status = req.body.status as AgentStatus;
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

  const [[agent], [tenant], [activeRunsResult]] = await Promise.all([
    db
      .select()
      .from(agentsTable)
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId))),
    db
      .select({ plan: tenantsTable.plan })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, req.tenantId)),
    db
      .select({ count: count() })
      .from(agentRunsTable)
      .where(
        and(
          eq(agentRunsTable.tenantId, req.tenantId),
          inArray(agentRunsTable.status, ["running", "queued"])
        )
      ),
  ]);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  if (agent.status !== "active") {
    res.status(400).json({ error: "Agent must be active to run" });
    return;
  }

  // Per-tenant concurrent run rate limiting
  const plan = tenant?.plan ?? "free";
  const limit = CONCURRENT_RUN_LIMITS[plan] ?? CONCURRENT_RUN_LIMITS.free;
  const activeCount = Number(activeRunsResult?.count ?? 0);

  if (activeCount >= limit) {
    res.status(429).json({
      error: "Concurrent run limit reached",
      message: `Your ${plan} plan allows ${limit === Infinity ? "unlimited" : limit} concurrent runs. You currently have ${activeCount} active. Please wait for a run to complete or upgrade your plan.`,
      plan,
      limit: limit === Infinity ? null : limit,
      active: activeCount,
    });
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

  await enqueueAgentRun({ runId: run.id, agentId: run.agentId, tenantId: run.tenantId });

  res.status(201).json(run);
});

export default router;
