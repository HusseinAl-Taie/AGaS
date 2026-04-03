import { Router, type IRouter } from "express";
import { db, agentRunsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { subscribeToRunEvents } from "../lib/runEvents";

const router: IRouter = Router();

/**
 * GET /api/runs/:runId/stream
 * Server-Sent Events endpoint — streams live step events for a run.
 * The client connects here while the run is in progress; events are forwarded
 * from the Redis pub/sub channel that AgentRunner writes to.
 */
router.get("/runs/:runId/stream", requireAuth, async (req, res): Promise<void> => {
  const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;

  // Verify the run belongs to this tenant
  const [run] = await db
    .select({ id: agentRunsTable.id, status: agentRunsTable.status })
    .from(agentRunsTable)
    .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.tenantId, req.tenantId)));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  // If the run is already in a terminal or paused state, emit appropriate event and close.
  // "awaiting_approval" is treated as stream-terminal: the run is paused and won't produce
  // more step events until approved (at which point a new SSE connection is opened).
  const terminalStatuses = ["completed", "failed", "cancelled", "budget_exceeded"];
  const streamTerminalStatuses = [...terminalStatuses, "awaiting_approval"];
  if (streamTerminalStatuses.includes(run.status)) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const eventType = terminalStatuses.includes(run.status) ? "done" : "status";
    res.write(`data: ${JSON.stringify({ type: eventType, payload: { status: run.status } })}\n\n`);
    res.end();
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering if present
  res.flushHeaders();

  // Send a heartbeat comment every 15s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  let subscriber: Awaited<ReturnType<typeof subscribeToRunEvents>>["subscriber"] | null = null;

  const cleanup = () => {
    clearInterval(heartbeat);
    if (subscriber) {
      try { subscriber.disconnect(); } catch { /* ignore */ }
      subscriber = null;
    }
  };

  req.on("close", cleanup);

  try {
    const sub = await subscribeToRunEvents(runId);
    subscriber = sub.subscriber;

    subscriber.on("message", (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as { type: string; payload: unknown };
        res.write(`data: ${JSON.stringify(event)}\n\n`);

        // Close stream on done events
        if (event.type === "done") {
          cleanup();
          res.end();
        }
      } catch {
        // ignore malformed messages
      }
    });

    // Race-condition guard: re-check run status after subscribing.
    // If the run finished between the initial status check and the Redis subscribe,
    // the terminal event would have already been published and we'd hang.
    const [currentRun] = await db
      .select({ status: agentRunsTable.status })
      .from(agentRunsTable)
      .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.tenantId, req.tenantId)));

    if (currentRun && streamTerminalStatuses.includes(currentRun.status)) {
      const eventType = terminalStatuses.includes(currentRun.status) ? "done" : "status";
      res.write(`data: ${JSON.stringify({ type: eventType, payload: { status: currentRun.status } })}\n\n`);
      cleanup();
      res.end();
    }
  } catch (err) {
    cleanup();
    res.write(`data: ${JSON.stringify({ type: "error", payload: { message: "Stream unavailable" } })}\n\n`);
    res.end();
  }
});

export default router;
