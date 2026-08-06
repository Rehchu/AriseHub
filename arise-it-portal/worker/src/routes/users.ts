import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { hashPassword, randomToken } from "../lib/crypto";
import { logAudit } from "../lib/audit";
import { sendInviteEmail, sendPasswordResetEmail } from "../lib/email";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);
app.use("*", requireRole("super_admin"));

function toSafeUser(u: typeof users.$inferSelect) {
  const { passwordHash, passwordSalt, ...safe } = u;
  return safe;
}

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const all = await db.select().from(users);
  return c.json({ users: all.map(toSafeUser) });
});

app.post("/", async (c) => {
  const body = await c.req.json<{ name: string; email: string; role: "super_admin" | "campus_admin" | "viewer"; campusId?: number }>();
  if (!body.name || !body.email || !body.role) return c.json({ error: "name, email, and role are required" }, 400);

  const tempPassword = randomToken(9);
  const { hash, salt } = await hashPassword(tempPassword);
  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(users)
    .values({
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash: hash,
      passwordSalt: salt,
      role: body.role,
      campusId: body.campusId ?? null,
      mustChangePassword: true,
    })
    .returning();

  await logAudit(c.env, { userId: c.get("user").id, action: "created", entityType: "user", entityId: created.id });

  const loginUrl = `${new URL(c.req.url).origin}/login`;
  const emailSent = await sendInviteEmail(c.env, {
    to: created.email,
    name: created.name,
    tempPassword,
    loginUrl,
  });

  // Temp password is returned once so the admin can share it (or as a fallback
  // when email isn't configured / didn't send).
  return c.json({ user: toSafeUser(created), tempPassword, emailSent }, 201);
});

app.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name?: string; role?: string; campusId?: number | null; active?: boolean }>();
  const db = drizzle(c.env.DB);
  const [updated] = await db.update(users).set(body as any).where(eq(users.id, id)).returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  await logAudit(c.env, { userId: c.get("user").id, action: "updated", entityType: "user", entityId: id });
  return c.json({ user: toSafeUser(updated) });
});

app.post("/:id/reset-password", async (c) => {
  const id = Number(c.req.param("id"));
  const tempPassword = randomToken(9);
  const { hash, salt } = await hashPassword(tempPassword);
  const db = drizzle(c.env.DB);
  const [updated] = await db
    .update(users)
    .set({ passwordHash: hash, passwordSalt: salt, mustChangePassword: true })
    .where(eq(users.id, id))
    .returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  await logAudit(c.env, { userId: c.get("user").id, action: "password_reset", entityType: "user", entityId: id });

  const loginUrl = `${new URL(c.req.url).origin}/login`;
  const emailSent = await sendPasswordResetEmail(c.env, {
    to: updated.email,
    name: updated.name,
    tempPassword,
    loginUrl,
  });

  return c.json({ tempPassword, emailSent });
});

app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.update(users).set({ active: false }).where(eq(users.id, id));
  await logAudit(c.env, { userId: c.get("user").id, action: "deactivated", entityType: "user", entityId: id });
  return c.json({ ok: true });
});

export default app;
