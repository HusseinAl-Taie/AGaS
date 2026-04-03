import { type Request, type Response, type NextFunction } from "express";
import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CONCURRENT_RUN_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  enterprise: Infinity,
};

declare global {
  namespace Express {
    interface Request {
      tenantPlan: string;
      tenantRunLimit: number;
    }
  }
}

/**
 * Middleware: fetches the tenant plan and attaches `req.tenantPlan` / `req.tenantRunLimit`.
 * The actual atomic count check + insert happens inside the route handler using a DB
 * transaction with a per-tenant advisory lock to prevent race conditions.
 */
export async function rateLimitRuns(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const [tenant] = await db
    .select({ plan: tenantsTable.plan })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, req.tenantId));

  const plan = tenant?.plan ?? "free";
  req.tenantPlan = plan;
  req.tenantRunLimit = CONCURRENT_RUN_LIMITS[plan] ?? CONCURRENT_RUN_LIMITS.free;

  next();
}

export { CONCURRENT_RUN_LIMITS };
