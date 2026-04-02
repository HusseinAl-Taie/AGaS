import type { Job } from "bullmq";
import { createAgentRunWorker, type AgentRunJobData } from "../lib/queue";
import { AgentRunner } from "./agentRunner";
import { logger } from "../lib/logger";

async function processAgentRun(job: Job<AgentRunJobData>): Promise<void> {
  const { runId, agentId, tenantId } = job.data;
  logger.info({ runId, agentId }, "Processing agent run job");

  const runner = new AgentRunner(runId, agentId, tenantId);
  await runner.execute();
}

export function startWorker() {
  const worker = createAgentRunWorker(processAgentRun);
  logger.info("Agent run worker started");
  return worker;
}
