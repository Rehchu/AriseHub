import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { verifyJwt } from "./jwt";
import { sha256Hex } from "./crypto";
import { sessions, users } from "../db/schema";
import { verifySupabaseJwt } from "./supabase-auth";
import { agentBlock } from "./agent-guards";
import { logAudit } from "./audit";
import type { Env, Variables, Role } from "../types";

export const SESSION_COOKIE = "church_session";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Auth for the IT API. Two accepted identities:
 *
 *  1. An AriseHub (Supabase) session — `Authorization: Bearer <supabase jwt>`.
 *     Verified against the project's JWKS, then mapped BY EMAIL to the local
 *     `users` row that carries this portal's role/campus. This is the single
 *     sign-in path: one AriseHub account, no separate IT login. Since AriseHub
 *     began minting agent sessions (POST /api/agent/token), this is also how an
 *     automation reaches the portal — so it is marked `automated` and the four
 *     doors in lib/agent-guards.ts are shut on it.
 *  2. The portal's own `church_session` cookie — the original login, kept
 *     working so nothing breaks while the bridge is proven out. This is the
 *     path every browser takes.
 *
 * Guest access-pass cookies are handled separately and are unaffected.
 */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
  const db = drizzle(c.env.DB);

  // --- Path 1: AriseHub / Supabase bearer token -----------------------------
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ") && c.env.SUPABASE_URL) {
    const supaToken = authHeader.slice(7).trim();
    const payload = await verifySupabaseJwt(supaToken, c.env.SUPABASE_URL);
    if (!payload?.email) {
      return c.json({ error: "Invalid or expired AriseHub session" }, 401);
    }

    // Identity maps by email. A verified Supabase user with no matching IT user
    // row gets no access here — IT permissions stay governed by this database.
    const email = payload.email.toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.active) {
      return c.json({ error: "No active IT account for this AriseHub user" }, 403);
    }

    /* A bearer token on a protected route is not a browser.

       Every browser path into this portal ends in a church_session cookie —
       /api/auth/login and all three SSO routes call setCookie, and the SPA
       sends `credentials: "include"` with no Authorization header. The one
       Bearer it ever sends is the hand-off to /api/auth/sso, which is a login
       route and does not pass through here. So reaching this line means an
       AriseHub agent session (or someone scripting with their own token, which
       carries the same risk and deserves the same answer).

       That is the whole marker. No custom JWT claim to mint, no lookup against
       Supabase, no per-request hop to AriseHub — just the observation that
       people arrive with cookies. */
    const identity = { id: user.id, role: user.role as Role, campusId: user.campusId ?? null, automated: true as const };

    const block = agentBlock(c.req.method, c.req.path);
    if (block) {
      await logAudit(c.env, {
        userId: user.id,
        action: "agent_refused",
        entityType: "user",
        entityId: user.id,
        details: { method: c.req.method, path: c.req.path, reason: block.error },
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ error: block.error }, block.status);
    }

    /* Every write an agent makes goes on the record, whether or not the handler
       it reaches logs anything of its own. A person's actions are attributable
       because they signed in; an agent's are attributable only because we say
       so — and AriseHub attributes its agent's changes to the owner "exactly as
       if they had made them", so this is where the distinction survives. */
    if (!READ_METHODS.has(c.req.method.toUpperCase())) {
      await logAudit(c.env, {
        userId: user.id,
        action: "agent_request",
        entityType: "user",
        entityId: user.id,
        details: { method: c.req.method, path: c.req.path },
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
    }

    c.set("user", identity);
    await next();
    return;
  }

  // --- Path 2: this portal's own session cookie ------------------------------
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "Invalid or expired session" }, 401);

  // Confirm the session hasn't been revoked (logout / logout-everywhere).
  const tokenHash = await sha256Hex(token);
  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return c.json({ error: "Session revoked" }, 401);
  }

  // Re-read role, campus and active from the database rather than trusting the
  // token. This used to take role/campusId straight off the JWT, so
  // deactivating or demoting someone had no effect until their 7-day token
  // expired — and every SSO hand-off mints another session, so one person can
  // hold a dozen at once. The Supabase path above already re-reads and checks
  // `active`; the two identities disagreeing was the bug.
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || !user.active) {
    return c.json({ error: "Account is no longer active" }, 401);
  }

  c.set("user", { id: user.id, role: user.role as Role, campusId: user.campusId ?? null });
  await next();
}

export function requireRole(...roles: Role[]) {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const user = c.get("user");
    if (!roles.includes(user.role)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}

/** For campus-scoped resources: super_admin sees everything, campus_admin/viewer only their own campus. */
export function campusFilter(user: { role: Role; campusId: number | null }, requestedCampusId?: number | null) {
  if (user.role === "super_admin") return requestedCampusId ?? undefined;
  return user.campusId ?? -1; // -1 matches nothing if the scoped user has no campus assigned
}
