import app from "./app";
import { logger } from "./lib/logger";
import { startWorker } from "./worker/index";
import { startWebhookWorker } from "./lib/webhookQueue";
import { initScheduler } from "./lib/scheduler";

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
