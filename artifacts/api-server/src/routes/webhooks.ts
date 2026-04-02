import { Router, type IRouter } from "express";
import { db, webhooksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/webhooks", requireAuth, async (req, res): Promise<void> => {
  const webhooks = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.tenantId, req.tenantId));

  const safe = webhooks.map(({ secretHash: _s, ...rest }) => rest);
  res.json({ webhooks: safe });
});

router.post("/webhooks", requireAuth, async (req, res): Promise<void> => {
  const { url, agentId, events = [], secret } = req.body;

  if (!url || !secret) {
    res.status(400).json({ error: "url and secret are required" });
    return;
  }

  const secretHash = createHash("sha256").update(secret).digest("hex");

  const [webhook] = await db
    .insert(webhooksTable)
    .values({
      tenantId: req.tenantId,
      agentId: agentId ?? null,
      url,
      events,
      secretHash,
    })
    .returning();

  const { secretHash: _s, ...safe } = webhook;
  res.status(201).json(safe);
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

  const { secretHash: _s, ...safe } = webhook;
  res.json(safe);
});

export default router;
