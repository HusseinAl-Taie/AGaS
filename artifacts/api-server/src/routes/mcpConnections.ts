import { Router, type IRouter } from "express";
import { db, mcpConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/mcp-connections", requireAuth, async (req, res): Promise<void> => {
  const connections = await db
    .select()
    .from(mcpConnectionsTable)
    .where(eq(mcpConnectionsTable.tenantId, req.tenantId));

  const safeConnections = connections.map(({ authConfig: _auth, ...rest }) => rest);
  res.json({ connections: safeConnections });
});

router.post("/mcp-connections", requireAuth, async (req, res): Promise<void> => {
  const { name, serverUrl, authConfig = {} } = req.body;

  if (!name || !serverUrl) {
    res.status(400).json({ error: "name and serverUrl are required" });
    return;
  }

  const [conn] = await db
    .insert(mcpConnectionsTable)
    .values({ tenantId: req.tenantId, name, serverUrl, authConfig })
    .returning();

  const { authConfig: _auth, ...safe } = conn;
  res.status(201).json(safe);
});

router.delete("/mcp-connections/:connectionId", requireAuth, async (req, res): Promise<void> => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;

  const [conn] = await db
    .delete(mcpConnectionsTable)
    .where(and(eq(mcpConnectionsTable.id, connectionId), eq(mcpConnectionsTable.tenantId, req.tenantId)))
    .returning();

  if (!conn) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }

  const { authConfig: _auth, ...safe } = conn;
  res.json(safe);
});

router.post("/mcp-connections/:connectionId/test", requireAuth, async (req, res): Promise<void> => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;

  const [conn] = await db
    .select()
    .from(mcpConnectionsTable)
    .where(and(eq(mcpConnectionsTable.id, connectionId), eq(mcpConnectionsTable.tenantId, req.tenantId)));

  if (!conn) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${conn.serverUrl}`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
    clearTimeout(timeout);

    if (response.ok) {
      await db
        .update(mcpConnectionsTable)
        .set({ status: "active" })
        .where(eq(mcpConnectionsTable.id, connectionId));

      res.json({ success: true, tools: [], error: null });
    } else {
      await db
        .update(mcpConnectionsTable)
        .set({ status: "error" })
        .where(eq(mcpConnectionsTable.id, connectionId));

      res.json({ success: false, tools: [], error: `Server responded with ${response.status}` });
    }
  } catch (err: any) {
    await db
      .update(mcpConnectionsTable)
      .set({ status: "error" })
      .where(eq(mcpConnectionsTable.id, connectionId));

    res.json({ success: false, tools: [], error: err.message || "Connection failed" });
  }
});

export default router;
