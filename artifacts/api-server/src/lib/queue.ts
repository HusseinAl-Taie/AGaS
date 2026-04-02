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

export async function enqueueAgentRun(
  data: AgentRunJobData,
  opts: { isResume?: boolean } = {}
): Promise<string> {
  // For resumes, use a unique jobId so BullMQ does not deduplicate against
  // the original (now-completed) job.
  const jobId = opts.isResume
    ? `${data.runId}-resume-${Date.now()}`
    : data.runId;

  // If the original job is still in completed/failed state, remove it first
  // so a fresh run can use the same jobId without dedup issues.
  if (!opts.isResume) {
    try {
      const existing = await agentRunQueue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "completed" || state === "failed") {
          await existing.remove();
        }
      }
    } catch {
      // ignore removal errors — they're non-fatal
    }
  }

  const job = await agentRunQueue.add("run", data, { jobId });
  return job.id ?? jobId;
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
