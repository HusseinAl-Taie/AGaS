import { Router, type IRouter } from "express";
import { db, agentRunsTable, agentsTable } from "@workspace/db";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/analytics/usage", requireAuth, async (req, res): Promise<void> => {
  const { days = "30" } = req.query as Record<string, string>;
  const daysNum = parseInt(days, 10);
  const since = new Date();
  since.setDate(since.getDate() - daysNum);

  const runs = await db
    .select()
    .from(agentRunsTable)
    .where(and(eq(agentRunsTable.tenantId, req.tenantId), gte(agentRunsTable.createdAt, since)));

  const dayMap: Record<string, { runs: number; tokens: number; costCents: number; completed: number }> = {};

  for (const run of runs) {
    const dateKey = run.createdAt.toISOString().slice(0, 10);
    if (!dayMap[dateKey]) {
      dayMap[dateKey] = { runs: 0, tokens: 0, costCents: 0, completed: 0 };
    }
    dayMap[dateKey].runs++;
    dayMap[dateKey].tokens += run.totalTokens;
    dayMap[dateKey].costCents += run.costCents;
    if (run.status === "completed") dayMap[dateKey].completed++;
  }

  const dayStats = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      date,
      runs: stats.runs,
      tokens: stats.tokens,
      costCents: stats.costCents,
      successRate: stats.runs > 0 ? stats.completed / stats.runs : 0,
    }));

  const totalRuns = runs.length;
  const totalTokens = runs.reduce((s, r) => s + r.totalTokens, 0);
  const totalCostCents = runs.reduce((s, r) => s + r.costCents, 0);
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const successRate = totalRuns > 0 ? completedRuns / totalRuns : 0;

  res.json({ days: dayStats, totalRuns, totalTokens, totalCostCents, successRate });
});

router.get("/analytics/agents", requireAuth, async (req, res): Promise<void> => {
  const agents = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.tenantId, req.tenantId));

  const agentStats = await Promise.all(
    agents.map(async (agent) => {
      const runs = await db
        .select()
        .from(agentRunsTable)
        .where(and(eq(agentRunsTable.agentId, agent.id), eq(agentRunsTable.tenantId, req.tenantId)));

      const totalRuns = runs.length;
      const completedRuns = runs.filter((r) => r.status === "completed").length;
      const successRate = totalRuns > 0 ? completedRuns / totalRuns : 0;
      const avgCostCents = totalRuns > 0 ? Math.round(runs.reduce((s, r) => s + r.costCents, 0) / totalRuns) : 0;
      const avgTokens = totalRuns > 0 ? Math.round(runs.reduce((s, r) => s + r.totalTokens, 0) / totalRuns) : 0;
      const stepsArr = runs.map((r) => (Array.isArray(r.steps) ? r.steps.length : 0));
      const avgSteps = totalRuns > 0 ? stepsArr.reduce((s, n) => s + n, 0) / totalRuns : 0;

      return {
        agentId: agent.id,
        agentName: agent.name,
        totalRuns,
        successRate,
        avgCostCents,
        avgSteps,
        avgTokens,
      };
    })
  );

  res.json({ agents: agentStats });
});

export default router;
