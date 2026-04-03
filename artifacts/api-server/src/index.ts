import app from "./app";
import { logger } from "./lib/logger";
import { startWorker } from "./worker/index";
import { startWebhookWorker } from "./lib/webhookQueue";
import { initScheduler } from "./lib/scheduler";
import { db, webhooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start the BullMQ worker for agent run processing
const worker = startWorker();

// Start the BullMQ worker for webhook delivery
const webhookWorker = startWebhookWorker();

// Initialize cron scheduler (loads all enabled schedules from DB)
initScheduler().catch((err) => {
  logger.error({ err }, "Failed to initialize scheduler");
});

// One-time backfill: populate signing_secret for legacy webhook rows that have an empty value.
// This ensures they can deliver again after the signing_secret column was added.
async function backfillWebhookSigningSecrets() {
  try {
    const legacyWebhooks = await db
      .select({ id: webhooksTable.id })
      .from(webhooksTable)
      .where(eq(webhooksTable.signingSecret, ""));

    if (legacyWebhooks.length === 0) return;

    for (const wh of legacyWebhooks) {
      const newSecret = randomBytes(32).toString("hex");
      await db
        .update(webhooksTable)
        .set({ signingSecret: newSecret })
        .where(eq(webhooksTable.id, wh.id));
    }
    logger.info({ count: legacyWebhooks.length }, "Backfilled signing_secret for legacy webhooks — rotate via Settings > Webhooks");
  } catch (err) {
    logger.error({ err }, "Failed to backfill webhook signing secrets");
  }
}

backfillWebhookSigningSecrets();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await Promise.all([worker.close(), webhookWorker.close()]);
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await Promise.all([worker.close(), webhookWorker.close()]);
  process.exit(0);
});
