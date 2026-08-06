import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { verifyJwt } from "./jwt";
import { sha256Hex } from "./crypto";
import { sessions } from "../db/schema";
import type { Env, Variables, Role } from "../types";

export const SESSION_COOKIE = "church_session";

export async function requireAuth(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "Invalid or expired session" }, 401);

  // Confirm the session hasn't been revoked (logout / logout-everywhere).
  const db = drizzle(c.env.DB);
  const tokenHash = await sha256Hex(token);
  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return c.json({ error: "Session revoked" }, 401);
  }

  c.set("user", { id: payload.sub, role: payload.role as Role, campusId: (payload.campusId as number) ?? null });
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
