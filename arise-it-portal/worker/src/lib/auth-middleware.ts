import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { verifyJwt } from "./jwt";
import { sha256Hex } from "./crypto";
import { sessions, users } from "../db/schema";
import { verifySupabaseJwt } from "./supabase-auth";
import type { Env, Variables, Role } from "../types";

export const SESSION_COOKIE = "church_session";

/**
 * Auth for the IT API. Two accepted identities:
 *
 *  1. An AriseHub (Supabase) session — `Authorization: Bearer <supabase jwt>`.
 *     Verified against the project's JWKS, then mapped BY EMAIL to the local
 *     `users` row that carries this portal's role/campus. This is the single
 *     sign-in path: one AriseHub account, no separate IT login.
 *  2. The portal's own `church_session` cookie — the original login, kept
 *     working so nothing breaks while the bridge is proven out.
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

    c.set("user", { id: user.id, role: user.role as Role, campusId: user.campusId ?? null });
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
