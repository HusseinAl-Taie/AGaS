import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { createHmac } from "crypto";
import { db, webhooksTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export type WebhookEvent = "run.completed" | "run.failed" | "approval.required" | "run.cancelled";

export interface WebhookJobData {
  tenantId: string;
  agentId: string;
  runId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
}

const webhookQueueConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

webhookQueueConnection.on("error", (err) => {
  logger.error({ err }, "webhookQueue Redis connection error");
});

export const webhookQueue = new Queue<WebhookJobData>("webhook-deliveries", {
  connection: webhookQueueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

export async function enqueueWebhookDelivery(data: WebhookJobData): Promise<void> {
  try {
    await webhookQueue.add("deliver", data);
  } catch (err) {
    logger.error({ err, runId: data.runId }, "Failed to enqueue webhook delivery");
  }
}

async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { tenantId, agentId, runId, event, payload } = job.data;

  // Find all webhooks for this tenant+agent that subscribe to this event
  const allWebhooks = await db
    .select()
    .from(webhooksTable)
    .where(
      or(
        eq(webhooksTable.tenantId, tenantId),
      )
    );

  const matching = allWebhooks.filter((wh) => {
    if (wh.tenantId !== tenantId) return false;
    if (wh.agentId && wh.agentId !== agentId) return false;
    return (wh.events as string[]).includes(event);
  });

  if (matching.length === 0) return;

  const body = JSON.stringify({ event, runId, agentId, ...payload, timestamp: new Date().toISOString() });

  await Promise.allSettled(
    matching.map(async (wh) => {
      const sig = createHmac("sha256", wh.secretHash).update(body).digest("hex");

      const resp = await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AaaS-Signature": `sha256=${sig}`,
          "X-AaaS-Event": event,
        },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        throw new Error(`Webhook ${wh.id} responded ${resp.status}`);
      }

      logger.info({ webhookId: wh.id, event, runId }, "Webhook delivered");
    })
  );
}

export function startWebhookWorker() {
  const worker = new Worker<WebhookJobData>("webhook-deliveries", processWebhookJob, {
    connection: new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }),
    concurrency: 10,
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Webhook delivery failed");
  });

  logger.info("Webhook delivery worker started");
  return worker;
}
