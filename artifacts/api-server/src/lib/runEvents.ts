import IORedis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function makeChannel(runId: string) {
  return `run:${runId}:events`;
}

// Publisher — shared instance used by AgentRunner
export const runEventPublisher = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

runEventPublisher.on("error", (err) => {
  logger.error({ err }, "runEventPublisher Redis error");
});

export interface RunEvent {
  type: "step" | "status" | "done";
  payload: Record<string, unknown>;
}

export async function publishRunEvent(runId: string, event: RunEvent): Promise<void> {
  try {
    await runEventPublisher.publish(makeChannel(runId), JSON.stringify(event));
  } catch (err) {
    logger.error({ runId, err }, "Failed to publish run event");
  }
}

/**
 * Subscribe to run events. Returns the subscriber and an async iterable.
 * Call subscriber.disconnect() to clean up.
 */
export async function subscribeToRunEvents(
  runId: string
): Promise<{ subscriber: IORedis; channel: string }> {
  const subscriber = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  subscriber.on("error", (err) => {
    logger.error({ err, runId }, "runEvent subscriber Redis error");
  });

  const channel = makeChannel(runId);
  await subscriber.subscribe(channel);
  return { subscriber, channel };
}
