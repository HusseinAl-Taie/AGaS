import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { createHmac } from "crypto";
import { lookup } from "dns/promises";
import { db, webhooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// SSRF guard — block private/loopback/link-local CIDRs and cloud metadata endpoints
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^169\.254\./,       // link-local (AWS metadata etc.)
  /^10\./,             // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC-1918
  /^192\.168\./,       // RFC-1918
  /^127\./,            // loopback
  /^::1$/,             // IPv6 loopback
  /^fc00:/i,           // IPv6 unique-local
  /^fd[0-9a-f]{2}:/i,  // IPv6 unique-local
];

async function assertNotSsrf(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid webhook URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Webhook URL must use http(s), got: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Webhook URL targets a private/reserved address: ${hostname}`);
    }
  }

  // DNS resolution check — block if the resolved IP is private
  try {
    const { address } = await lookup(hostname);
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(address)) {
        throw new Error(`Webhook URL resolves to a private address (${address}): ${hostname}`);
      }
    }
  } catch (dnsErr: unknown) {
    if (dnsErr instanceof Error && dnsErr.message.startsWith("Webhook URL")) throw dnsErr;
    // DNS failure — let fetch handle it (not a security concern)
  }
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export type WebhookEvent = "run.completed" | "run.failed" | "approval.required" | "run.cancelled";

export interface WebhookJobData {
  webhookId: string;
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

/**
 * Find all matching webhooks for the given tenant/agent/event and enqueue
 * one delivery job per webhook so BullMQ retries each independently.
 */
export async function enqueueWebhookDeliveries(data: Omit<WebhookJobData, "webhookId">): Promise<void> {
  try {
    const allWebhooks = await db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.tenantId, data.tenantId));

    const matching = allWebhooks.filter((wh) => {
      if (wh.agentId && wh.agentId !== data.agentId) return false;
      return (wh.events as string[]).includes(data.event);
    });

    if (matching.length === 0) return;

    await Promise.all(
      matching.map((wh) =>
        webhookQueue.add("deliver", { ...data, webhookId: wh.id })
      )
    );
  } catch (err) {
    logger.error({ err, runId: data.runId }, "Failed to enqueue webhook deliveries");
  }
}

/** @deprecated Use enqueueWebhookDeliveries */
export const enqueueWebhookDelivery = enqueueWebhookDeliveries;

async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { webhookId, agentId, runId, event, payload } = job.data;

  const [wh] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.id, webhookId));

  if (!wh) {
    // Webhook deleted — nothing to do, don't retry
    return;
  }

  const body = JSON.stringify({
    event,
    runId,
    agentId,
    ...payload,
    timestamp: new Date().toISOString(),
  });

  // Block SSRF before making the outbound request
  await assertNotSsrf(wh.url);

  // Require a valid signingSecret — legacy rows with empty string must be rejected
  // rather than silently signing with the wrong key (secretHash is not the raw secret)
  if (!wh.signingSecret) {
    throw new Error(
      `Webhook ${webhookId} has no signingSecret — please rotate its secret via PUT /api/webhooks/${webhookId} to re-enable deliveries`
    );
  }

  const sig = createHmac("sha256", wh.signingSecret).update(body).digest("hex");

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
    // Throw so BullMQ marks the job failed and applies exponential backoff retry
    throw new Error(`Webhook ${webhookId} responded ${resp.status} ${resp.statusText}`);
  }

  logger.info({ webhookId, event, runId }, "Webhook delivered");
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
    logger.error({ jobId: job?.id, webhookId: job?.data.webhookId, err }, "Webhook delivery failed");
  });

  logger.info("Webhook delivery worker started");
  return worker;
}
