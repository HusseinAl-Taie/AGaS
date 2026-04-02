import { Router, type IRouter } from "express";
import { db, mcpConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * Validate that a URL is safe to probe from the server side.
 * Blocks: non-https/http protocols, private/link-local/loopback IP ranges,
 * metadata service endpoints, and localhost variants.
 */
function validateSafeUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  // Only allow http and https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http and https protocols are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost")
  ) {
    return { ok: false, reason: "Connections to localhost are not allowed" };
  }

  // Block AWS/GCP/Azure instance metadata endpoints
  const blocked = [
    "169.254.169.254", // AWS/GCP/Azure metadata
    "metadata.google.internal",
    "fd00:ec2::254", // AWS IPv6 metadata
  ];
  for (const b of blocked) {
    if (hostname === b) {
      return { ok: false, reason: "Connections to metadata endpoints are not allowed" };
    }
  }

  // Block private IP ranges (IPv4 only — good enough for most cases)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = hostname.match(ipv4Regex);
  if (ipv4Match) {
    const [, a, b, c] = ipv4Match.map(Number);
    if (
      a === 10 || // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) || // 169.254.0.0/16 link-local
      a === 127 || // 127.0.0.0/8 loopback
      a === 0 // 0.0.0.0/8
    ) {
      return { ok: false, reason: "Connections to private/internal IP ranges are not allowed" };
    }
  }

  return { ok: true, url: parsed };
}

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

  const validation = validateSafeUrl(serverUrl);
  if (!validation.ok) {
    res.status(400).json({ error: `Invalid server URL: ${validation.reason}` });
    return;
  }

  const [conn] = await db
    .insert(mcpConnectionsTable)
    .values({ tenantId: req.tenantId, name, serverUrl, authConfig })
    .returning();

  const { authConfig: _auth, ...safe } = conn;
  res.status(201).json(safe);
});

router.get("/mcp-connections/:connectionId", requireAuth, async (req, res): Promise<void> => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;

  const [conn] = await db
    .select()
    .from(mcpConnectionsTable)
    .where(and(eq(mcpConnectionsTable.id, connectionId), eq(mcpConnectionsTable.tenantId, req.tenantId)));

  if (!conn) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }

  const { authConfig: _auth, ...safe } = conn;
  res.json(safe);
});

router.put("/mcp-connections/:connectionId", requireAuth, async (req, res): Promise<void> => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;

  const [existing] = await db
    .select()
    .from(mcpConnectionsTable)
    .where(and(eq(mcpConnectionsTable.id, connectionId), eq(mcpConnectionsTable.tenantId, req.tenantId)));

  if (!existing) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }

  const updates: Partial<Pick<typeof mcpConnectionsTable.$inferInsert, "name" | "serverUrl" | "authConfig">> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.serverUrl !== undefined) {
    const validation = validateSafeUrl(req.body.serverUrl);
    if (!validation.ok) {
      res.status(400).json({ error: `Invalid server URL: ${validation.reason}` });
      return;
    }
    updates.serverUrl = req.body.serverUrl;
  }
  if (req.body.authConfig !== undefined) updates.authConfig = req.body.authConfig;

  const [conn] = await db
    .update(mcpConnectionsTable)
    .set({ ...updates, status: "inactive" })
    .where(and(eq(mcpConnectionsTable.id, connectionId), eq(mcpConnectionsTable.tenantId, req.tenantId)))
    .returning();

  const { authConfig: _auth, ...safe } = conn;
  res.json(safe);
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

  // Validate the stored URL is safe before probing (defence-in-depth: also validated on create)
  const validation = validateSafeUrl(conn.serverUrl);
  if (!validation.ok) {
    await db
      .update(mcpConnectionsTable)
      .set({ status: "error" })
      .where(eq(mcpConnectionsTable.id, connectionId));
    res.json({ success: false, tools: [], error: `Unsafe server URL: ${validation.reason}` });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(conn.serverUrl, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
      redirect: "error", // Never follow redirects that could point to internal services
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
  } catch (err) {
    await db
      .update(mcpConnectionsTable)
      .set({ status: "error" })
      .where(eq(mcpConnectionsTable.id, connectionId));

    const message = err instanceof Error ? err.message : "Connection failed";
    res.json({ success: false, tools: [], error: message });
  }
});

export default router;
