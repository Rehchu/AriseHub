import { drizzle } from "drizzle-orm/d1";
import { auditLog } from "../db/schema";
import type { Env } from "../types";

export async function logAudit(
  env: Env,
  entry: {
    userId: number | null;
    action: string;
    entityType: string;
    entityId?: number | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  }
) {
  const db = drizzle(env.DB);
  await db.insert(auditLog).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: entry.details ? JSON.stringify(entry.details) : null,
    ipAddress: entry.ipAddress ?? null,
  });
}
