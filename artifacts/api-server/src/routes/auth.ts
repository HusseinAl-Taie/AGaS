import { Router, type IRouter } from "express";
import { db, usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { createClerkClient } from "@clerk/express";
import { requireAuth, requireAuthOrOnboard } from "../middlewares/requireAuth";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const router: IRouter = Router();

router.get("/auth/me", requireAuthOrOnboard, async (req, res): Promise<void> => {
  if (!req.userId) {
    res.status(403).json({ error: "User not onboarded" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    role: user.role,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      createdAt: tenant.createdAt,
    },
    createdAt: user.createdAt,
  });
});

router.post("/auth/onboard", requireAuthOrOnboard, async (req, res): Promise<void> => {
  const { tenantName } = req.body;

  if (!tenantName) {
    res.status(400).json({ error: "tenantName is required" });
    return;
  }

  const existingUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, req.clerkUserId));

  if (existingUser.length > 0) {
    const user = existingUser[0];
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId));
    res.status(200).json({
      id: user.id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      role: user.role,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        createdAt: tenant.createdAt,
      },
      createdAt: user.createdAt,
    });
    return;
  }

  // Derive email from Clerk identity — do not trust client-supplied email
  let email = "";
  try {
    const clerkUser = await clerkClient.users.getUser(req.clerkUserId);
    email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  } catch {
    email = "";
  }

  const [tenant] = await db
    .insert(tenantsTable)
    .values({ name: tenantName })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({
      tenantId: tenant.id,
      clerkUserId: req.clerkUserId,
      email,
      role: "owner",
    })
    .returning();

  res.status(201).json({
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    role: user.role,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      createdAt: tenant.createdAt,
    },
    createdAt: user.createdAt,
  });
});

router.post("/auth/api-key/rotate", requireAuth, async (req, res): Promise<void> => {
  const rawKey = `aaas_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(rawKey).digest("hex");

  await db
    .update(tenantsTable)
    .set({ apiKeyHash: hash })
    .where(eq(tenantsTable.id, req.tenantId));

  res.json({ apiKey: rawKey });
});

export default router;
