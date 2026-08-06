import { drizzle } from "drizzle-orm/d1";
import { and, eq, gte, sql } from "drizzle-orm";
import { auditLog } from "../db/schema";
import type { Env } from "../types";

// Counts recent audit-log entries of `action` from this IP. Piggybacks on the
// existing audit table rather than adding KV/DO infra — plenty for a small
// church portal's public endpoints.
export async function isRateLimited(
  env: Env,
  action: string,
  ipAddress: string,
  { limit, windowMinutes }: { limit: number; windowMinutes: number }
): Promise<boolean> {
  const db = drizzle(env.DB);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .where(and(eq(auditLog.action, action), eq(auditLog.ipAddress, ipAddress), gte(auditLog.createdAt, since)))) as {
    count: number;
  }[];
  return count >= limit;
}
