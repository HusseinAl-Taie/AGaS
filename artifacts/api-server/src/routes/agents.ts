import { Router, type IRouter } from "express";
import { db, agentsTable, agentRunsTable } from "@workspace/db";
import { eq, and, desc, count, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { rateLimitRuns } from "../middlewares/rateLimitRuns";
import { enqueueAgentRun } from "../lib/queue";

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

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Agent name is required" });
    return;
  }

  const [agent] = await db
    .insert(agentsTable)
    .values({
      tenantId: req.tenantId,
      name: name.trim(),
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

  const {
    name,
    description,
    systemPrompt,
    model,
    tools,
    maxSteps,
    maxBudgetCents,
    approvalMode,
    status,
  } = req.body;

  const [existing] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)));

  if (!existing) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const VALID_STATUSES: AgentStatus[] = ["active", "paused", "archived"];
  if (status !== undefined && !VALID_STATUSES.includes(status as AgentStatus)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  const VALID_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-6"];
  if (model !== undefined && !VALID_MODELS.includes(model as string)) {
    res.status(400).json({ error: `Invalid model. Must be one of: ${VALID_MODELS.join(", ")}` });
    return;
  }

  const VALID_APPROVAL_MODES = ["auto", "human_in_loop"];
  if (approvalMode !== undefined && !VALID_APPROVAL_MODES.includes(approvalMode as string)) {
    res.status(400).json({ error: `Invalid approvalMode. Must be one of: ${VALID_APPROVAL_MODES.join(", ")}` });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
  if (model !== undefined) updates.model = model;
  if (tools !== undefined) updates.tools = tools;
  if (maxSteps !== undefined) updates.maxSteps = maxSteps;
  if (maxBudgetCents !== undefined) updates.maxBudgetCents = maxBudgetCents;
  if (approvalMode !== undefined) updates.approvalMode = approvalMode;
  if (status !== undefined) updates.status = status as AgentStatus;

  const [updated] = await db
    .update(agentsTable)
    .set(updates)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)))
    .returning();

  res.json(updated);
});

/**
 * DELETE /agents/:agentId — soft-archive (status → "archived").
 * Returns 200 + the updated Agent so the client can reflect the new state.
 * Hard-delete is intentionally avoided: agent_runs FK references agents.id.
 */
router.delete("/agents/:agentId", requireAuth, async (req, res): Promise<void> => {
  const agentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;

  const [existing] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)));

  if (!existing) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [archived] = await db
    .update(agentsTable)
    .set({ status: "archived" })
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)))
    .returning();

  res.json(archived);
});

/**
 * POST /agents/:agentId/run
 *
 * Triggers a new agent run. Rate-limited by the `rateLimitRuns` middleware which
 * attaches `req.tenantPlan` and `req.tenantRunLimit`. The count check and insert
 * are performed atomically inside a single DB transaction protected by a per-tenant
 * PostgreSQL advisory lock to prevent race conditions under concurrent requests.
 */
router.post(
  "/agents/:agentId/run",
  requireAuth,
  rateLimitRuns,
  async (req, res): Promise<void> => {
    const agentId = Array.isArray(req.params.agentId)
      ? req.params.agentId[0]
      : req.params.agentId;

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, req.tenantId)));

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (agent.status !== "active") {
      res.status(400).json({ error: "Agent must be active to run" });
      return;
    }

    const { input = {}, trigger = "manual" } = req.body;
    const limit = req.tenantRunLimit;
    const plan = req.tenantPlan;

    // Atomically check concurrent run count + insert using a per-tenant advisory lock.
    // pg_advisory_xact_lock serializes all requests for the same tenant — the lock is
    // held until the transaction commits or rolls back, preventing TOCTOU races.
    let run: typeof agentRunsTable.$inferSelect;

    try {
      run = await db.transaction(async (tx) => {
        // Hash tenant UUID to a stable bigint for the advisory lock key
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(('x' || substr(md5(${req.tenantId}), 1, 16))::bit(64)::bigint)`
        );

        const [{ activeCount }] = await tx
          .select({ activeCount: count() })
          .from(agentRunsTable)
          .where(
            and(
              eq(agentRunsTable.tenantId, req.tenantId),
              inArray(agentRunsTable.status, ["running", "queued"])
            )
          );

        const active = Number(activeCount);

        if (limit !== Infinity && active >= limit) {
          const err = new Error("rate_limit") as Error & {
            isRateLimit: boolean;
            active: number;
          };
          err.isRateLimit = true;
          err.active = active;
          throw err;
        }

        const [newRun] = await tx
          .insert(agentRunsTable)
          .values({
            agentId,
            tenantId: req.tenantId,
            trigger,
            input,
            status: "queued",
          })
          .returning();

        return newRun;
      });
    } catch (err) {
      if ((err as { isRateLimit?: boolean }).isRateLimit) {
        const e = err as { active: number };
        res.status(429).json({
          error: "Concurrent run limit reached",
          message: `Your ${plan} plan allows ${limit} concurrent runs. You currently have ${e.active} active. Please wait for a run to complete or upgrade your plan.`,
          plan,
          limit,
          active: e.active,
        });
        return;
      }
      throw err;
    }

    await enqueueAgentRun({ runId: run.id, agentId: run.agentId, tenantId: run.tenantId });

    res.status(201).json(run);
  }
);

export default router;
