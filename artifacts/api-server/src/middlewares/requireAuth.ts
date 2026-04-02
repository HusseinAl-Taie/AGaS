import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      userId: string;
      clerkUserId: string;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));

  if (!user) {
    req.clerkUserId = clerkUserId;
    res.status(403).json({ error: "User not onboarded. Please complete setup." });
    return;
  }

  req.userId = user.id;
  req.tenantId = user.tenantId;
  req.clerkUserId = clerkUserId;
  next();
};

export const requireAuthOrOnboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.clerkUserId = clerkUserId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));

  if (user) {
    req.userId = user.id;
    req.tenantId = user.tenantId;
  }

  next();
};
