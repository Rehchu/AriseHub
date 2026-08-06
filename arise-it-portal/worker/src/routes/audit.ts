import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq, and } from "drizzle-orm";
import { auditLog, users } from "../db/schema";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);
app.use("*", requireRole("super_admin", "campus_admin"));

app.get("/", async (c) => {
  const { entityType, userId, limit } = c.req.query();
  const db = drizzle(c.env.DB);

  const conditions = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (userId) conditions.push(eq(auditLog.userId, Number(userId)));

  const rows = await db
    .select({ log: auditLog, userName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit ? Number(limit) : 200);

  return c.json({ entries: rows.map((r) => ({ ...r.log, userName: r.userName })) });
});

export default app;
