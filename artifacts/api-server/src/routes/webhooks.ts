import { Router, type IRouter } from "express";
import { db, webhooksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Strips both secretHash and signingSecret before sending to clients
function sanitize(webhook: typeof webhooksTable.$inferSelect) {
  const { secretHash: _sh, signingSecret: _ss, ...safe } = webhook;
  return safe;
}

router.get("/webhooks", requireAuth, async (req, res): Promise<void> => {
  const webhooks = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.tenantId, req.tenantId));

  res.json({ webhooks: webhooks.map(sanitize) });
});

router.post("/webhooks", requireAuth, async (req, res): Promise<void> => {
  const { url, agentId, events = [], secret } = req.body;

  if (!url || !secret) {
    res.status(400).json({ error: "url and secret are required" });
    return;
  }

  // secretHash: used for display/identification only; signingSecret: used for HMAC
  const secretHash = createHash("sha256").update(secret as string).digest("hex");

  const [webhook] = await db
    .insert(webhooksTable)
    .values({
      tenantId: req.tenantId,
      agentId: agentId ?? null,
      url,
      events,
      secretHash,
      signingSecret: secret as string,
    })
    .returning();

  res.status(201).json(sanitize(webhook));
});

router.get("/webhooks/:webhookId", requireAuth, async (req, res): Promise<void> => {
  const webhookId = Array.isArray(req.params.webhookId) ? req.params.webhookId[0] : req.params.webhookId;

  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(and(eq(webhooksTable.id, webhookId), eq(webhooksTable.tenantId, req.tenantId)));

  if (!webhook) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  res.json(sanitize(webhook));
});

router.put("/webhooks/:webhookId", requireAuth, async (req, res): Promise<void> => {
  const webhookId = Array.isArray(req.params.webhookId) ? req.params.webhookId[0] : req.params.webhookId;

  const [existing] = await db
    .select()
    .from(webhooksTable)
    .where(and(eq(webhooksTable.id, webhookId), eq(webhooksTable.tenantId, req.tenantId)));

  if (!existing) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  const updates: Partial<Pick<typeof webhooksTable.$inferInsert, "url" | "events" | "agentId" | "secretHash" | "signingSecret">> = {};
  if (req.body.url !== undefined) updates.url = req.body.url;
  if (req.body.events !== undefined) updates.events = req.body.events;
  if (req.body.agentId !== undefined) updates.agentId = req.body.agentId;
  if (req.body.secret !== undefined) {
    updates.secretHash = createHash("sha256").update(req.body.secret as string).digest("hex");
    updates.signingSecret = req.body.secret as string;
  }

  const [webhook] = await db
    .update(webhooksTable)
    .set(updates)
    .where(and(eq(webhooksTable.id, webhookId), eq(webhooksTable.tenantId, req.tenantId)))
    .returning();

  res.json(sanitize(webhook));
});

router.delete("/webhooks/:webhookId", requireAuth, async (req, res): Promise<void> => {
  const webhookId = Array.isArray(req.params.webhookId) ? req.params.webhookId[0] : req.params.webhookId;

  const [webhook] = await db
    .delete(webhooksTable)
    .where(and(eq(webhooksTable.id, webhookId), eq(webhooksTable.tenantId, req.tenantId)))
    .returning();

  if (!webhook) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  res.json(sanitize(webhook));
});

export default router;
