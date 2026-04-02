import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./logger";

export interface AgentRunJobData {
  runId: string;
  agentId: string;
  tenantId: string;
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

export const agentRunQueue = new Queue<AgentRunJobData>("agent-runs", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export async function enqueueAgentRun(data: AgentRunJobData): Promise<string> {
  const job = await agentRunQueue.add("run", data, {
    jobId: data.runId,
  });
  return job.id ?? data.runId;
}

export function createAgentRunWorker(
  processor: (job: Job<AgentRunJobData>) => Promise<void>
): Worker<AgentRunJobData> {
  const worker = new Worker<AgentRunJobData>("agent-runs", processor, {
    connection: new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }),
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Agent run job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Agent run job failed");
  });

  return worker;
}
