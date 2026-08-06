import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users, sessions } from "../db/schema";
import { hashPassword, verifyPassword, randomToken, sha256Hex } from "../lib/crypto";
import { signJwt } from "../lib/jwt";
import { requireAuth, SESSION_COOKIE } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

const SESSION_DAYS = 7;

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: "Email and password required" }, 400);

  const db = drizzle(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user || !user.active) return c.json({ error: "Invalid credentials" }, 401);

  const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!ok) return c.json({ error: "Invalid credentials" }, 401);

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await signJwt(
    { sub: user.id, role: user.role, campusId: user.campusId, exp: Math.floor(expiresAt.getTime() / 1000) },
    c.env.JWT_SECRET
  );
  const tokenHash = await sha256Hex(token);
  await db.insert(sessions).values({ userId: user.id, tokenHash, expiresAt: expiresAt.toISOString() });
  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  await logAudit(c.env, { userId: user.id, action: "login", entityType: "user", entityId: user.id });

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      campusId: user.campusId,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

auth.post("/logout", requireAuth, async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = drizzle(c.env.DB);
    const tokenHash = await sha256Hex(token);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const authUser = c.get("user");
  const db = drizzle(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      campusId: user.campusId,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

auth.post("/change-password", requireAuth, async (c) => {
  const authUser = c.get("user");
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!newPassword || newPassword.length < 8) {
    return c.json({ error: "New password must be at least 8 characters" }, 400);
  }
  const db = drizzle(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!user) return c.json({ error: "Not found" }, 404);

  const ok = await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
  if (!ok) return c.json({ error: "Current password is incorrect" }, 401);

  const { hash, salt } = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash: hash, passwordSalt: salt, mustChangePassword: false })
    .where(eq(users.id, user.id));

  await logAudit(c.env, { userId: user.id, action: "change_password", entityType: "user", entityId: user.id });
  return c.json({ ok: true });
});

export default auth;
