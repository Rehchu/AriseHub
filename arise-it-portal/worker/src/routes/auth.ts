import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users, sessions } from "../db/schema";
import { hashPassword, verifyPassword, randomToken, sha256Hex } from "../lib/crypto";
import { signJwt } from "../lib/jwt";
import { verifySupabaseJwt } from "../lib/supabase-auth";
import { verifySsoCode } from "../lib/sso-code";
import { requireAuth, SESSION_COOKIE } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import { isRateLimited } from "../lib/rate-limit";
import type { Env, Variables } from "../types";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

const SESSION_DAYS = 7;

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: "Email and password required" }, 400);

  // Staff passwords are the only thing between the internet and the WiFi vault,
  // so cap guesses per IP the same way the guest-code endpoint does.
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  if (await isRateLimited(c.env, "login_attempt", ip, { limit: 10, windowMinutes: 10 })) {
    return c.json({ error: "Too many sign-in attempts — please wait a few minutes" }, 429);
  }

  const db = drizzle(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user || !user.active) {
    await logAudit(c.env, { userId: null, action: "login_attempt", entityType: "user", ipAddress: ip });
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!ok) {
    await logAudit(c.env, { userId: null, action: "login_attempt", entityType: "user", entityId: user.id, ipAddress: ip });
    return c.json({ error: "Invalid credentials" }, 401);
  }

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

/**
 * Single sign-on from AriseHub.
 *
 * The API accepts Supabase tokens (see lib/auth-middleware), but the portal
 * FRONTEND is a separate SPA that relies on the church_session cookie — so
 * arriving with a Supabase token alone still bounced to /login. This exchanges
 * a verified AriseHub session for a normal portal session cookie.
 *
 * Identity is mapped by email to an ACTIVE local user: an AriseHub account with
 * no IT account gets nothing here. IT permissions stay owned by this database.
 */
auth.post("/sso", async (c) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ") || !c.env.SUPABASE_URL) {
    return c.json({ error: "AriseHub session required" }, 401);
  }
  const payload = await verifySupabaseJwt(header.slice(7).trim(), c.env.SUPABASE_URL);
  if (!payload?.email) return c.json({ error: "Invalid or expired AriseHub session" }, 401);

  const db = drizzle(c.env.DB);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, payload.email.toLowerCase()))
    .limit(1);
  if (!user || !user.active) {
    return c.json({ error: "No active IT account for this AriseHub user" }, 403);
  }

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

  await logAudit(c.env, { userId: user.id, action: "sso_login", entityType: "user", entityId: user.id });

  return c.json({
    user: {
      id: user.id, name: user.name, email: user.email,
      role: user.role, campusId: user.campusId,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

/**
 * SSO via top-level POST (the "POST binding" pattern).
 *
 * AriseHub submits a hidden form straight to this endpoint. Because it is a
 * TOP-LEVEL navigation to this origin, the Set-Cookie is first-party and always
 * honoured — unlike a cross-origin fetch, which browsers now block. The token
 * travels in the request BODY, so it never lands in a URL or an access log,
 * and the service worker never sees it because we redirect before the SPA loads.
 */
auth.post("/sso-redirect", async (c) => {
  const fail = (msg: string) =>
    c.redirect("/login?sso=" + encodeURIComponent(msg), 302);

  let token = "";
  try {
    const form = await c.req.formData();
    token = String(form.get("token") ?? "");
  } catch {
    return fail("bad_request");
  }
  if (!token || !c.env.SUPABASE_URL) return fail("no_token");

  const payload = await verifySupabaseJwt(token, c.env.SUPABASE_URL);
  if (!payload?.email) return fail("invalid_session");

  const db = drizzle(c.env.DB);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, payload.email.toLowerCase()))
    .limit(1);
  if (!user || !user.active) return fail("no_it_account");

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const sessionToken = await signJwt(
    { sub: user.id, role: user.role, campusId: user.campusId, exp: Math.floor(expiresAt.getTime() / 1000) },
    c.env.JWT_SECRET
  );
  const tokenHash = await sha256Hex(sessionToken);
  await db.insert(sessions).values({ userId: user.id, tokenHash, expiresAt: expiresAt.toISOString() });
  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));

  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  await logAudit(c.env, { userId: user.id, action: "sso_login", entityType: "user", entityId: user.id });

  return c.redirect("/", 302);
});

/**
 * SSO landing point: a plain GET carrying a short-lived signed code.
 *
 * This is the fourth mechanism tried and the only one the environment allows —
 * cross-origin fetch, URL fragments and cross-site POST were each blocked
 * (blocked cookie, cached SPA JS, and a Cloudflare CSRF 403 respectively).
 *
 * The code asserts only "AriseHub says this email is signed in", is HMAC-signed
 * with a shared secret and expires in 60 seconds, so it is safe in a URL.
 * Identity still maps to an ACTIVE local user — IT permissions remain owned by
 * this database.
 */
auth.get("/sso-code", async (c) => {
  const fail = (msg: string) => c.redirect("/login?sso=" + encodeURIComponent(msg), 302);

  const code = c.req.query("c");
  const secret = c.env.SSO_SHARED_SECRET;
  if (!code || !secret) return fail("no_token");

  const email = await verifySsoCode(code, secret);
  if (!email) return fail("invalid_session");

  const db = drizzle(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active) return fail("no_it_account");

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const sessionToken = await signJwt(
    { sub: user.id, role: user.role, campusId: user.campusId, exp: Math.floor(expiresAt.getTime() / 1000) },
    c.env.JWT_SECRET
  );
  const tokenHash = await sha256Hex(sessionToken);
  await db.insert(sessions).values({ userId: user.id, tokenHash, expiresAt: expiresAt.toISOString() });
  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));

  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  await logAudit(c.env, { userId: user.id, action: "sso_login", entityType: "user", entityId: user.id });
  return c.redirect("/", 302);
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
