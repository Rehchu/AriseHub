import { Hono, Context, Next } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq } from "drizzle-orm";
import { accessPasses, assets, assetModels, categories, campuses, maintenanceRecords, wifiNetworks } from "../db/schema";
import { signJwt, verifyJwt } from "../lib/jwt";
import { sha256Hex, decryptSecret } from "../lib/crypto";
import { logAudit } from "../lib/audit";
import { isRateLimited } from "../lib/rate-limit";
import type { Env, Variables } from "../types";

// Quick Access: code-based, scoped, revocable guest sessions. A guest cookie
// carries {passId, scope, campusId} and grants access ONLY to these /api/guest
// routes — never to the admin API (requireAuth reads a different cookie).
const GUEST_COOKIE = "church_guest";
const GUEST_DAYS = 30;

interface GuestClaims {
  passId: number;
  scope: "equipment" | "wifi";
  campusId: number;
  wifiAllNetworks: boolean;
}

type GuestVariables = Variables & { guest: GuestClaims & { label: string } };

const app = new Hono<{ Bindings: Env; Variables: GuestVariables }>();

async function requireGuest(c: Context<{ Bindings: Env; Variables: GuestVariables }>, next: Next) {
  const token = getCookie(c, GUEST_COOKIE);
  if (!token) return c.json({ error: "No access code entered" }, 401);

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload || payload.role !== "guest") return c.json({ error: "Access expired — enter your code again" }, 401);

  // Re-check the pass row so revoking a pass cuts off existing devices immediately.
  const db = drizzle(c.env.DB);
  const [pass] = await db.select().from(accessPasses).where(eq(accessPasses.id, payload.sub)).limit(1);
  if (!pass || !pass.active) return c.json({ error: "This access code has been revoked" }, 401);

  c.set("guest", {
    passId: pass.id,
    scope: pass.scope,
    campusId: pass.campusId,
    wifiAllNetworks: pass.wifiAllNetworks,
    label: pass.label,
  });
  await next();
}

app.post("/unlock", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (await isRateLimited(c.env, "guest_unlock_attempt", ip, { limit: 10, windowMinutes: 10 })) {
    return c.json({ error: "Too many attempts — please wait a few minutes" }, 429);
  }

  const { code } = await c.req.json<{ code: string }>();
  if (!code?.trim()) return c.json({ error: "Enter an access code" }, 400);

  // Log the attempt before checking, so failed brute-force attempts count
  // toward the rate limit too.
  await logAudit(c.env, { userId: null, action: "guest_unlock_attempt", entityType: "access_pass", ipAddress: ip });

  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const codeHash = await sha256Hex(normalized);
  const db = drizzle(c.env.DB);
  const [pass] = await db
    .select()
    .from(accessPasses)
    .where(and(eq(accessPasses.codeHash, codeHash), eq(accessPasses.active, true)))
    .limit(1);
  if (!pass) return c.json({ error: "That code isn't valid" }, 401);

  const expiresAt = Math.floor(Date.now() / 1000) + GUEST_DAYS * 24 * 60 * 60;
  const token = await signJwt(
    { sub: pass.id, role: "guest", scope: pass.scope, campusId: pass.campusId, exp: expiresAt },
    c.env.JWT_SECRET
  );
  setCookie(c, GUEST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: GUEST_DAYS * 24 * 60 * 60,
  });

  await db.update(accessPasses).set({ lastUsedAt: new Date().toISOString() }).where(eq(accessPasses.id, pass.id));
  await logAudit(c.env, {
    userId: null,
    action: "guest_unlock",
    entityType: "access_pass",
    entityId: pass.id,
    details: { label: pass.label, scope: pass.scope },
    ipAddress: ip,
  });

  return c.json({ scope: pass.scope, label: pass.label });
});

app.post("/logout", async (c) => {
  deleteCookie(c, GUEST_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/me", requireGuest, async (c) => {
  const guest = c.get("guest");
  const db = drizzle(c.env.DB);
  const [campus] = await db.select().from(campuses).where(eq(campuses.id, guest.campusId)).limit(1);
  return c.json({ label: guest.label, scope: guest.scope, campusName: campus?.name ?? "" });
});

app.get("/equipment", requireGuest, async (c) => {
  const guest = c.get("guest");
  if (guest.scope !== "equipment") return c.json({ error: "This code doesn't cover equipment" }, 403);

  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ asset: assets, model: assetModels, categoryName: categories.name })
    .from(assets)
    .innerJoin(assetModels, eq(assets.modelId, assetModels.id))
    .innerJoin(categories, eq(assetModels.categoryId, categories.id))
    .where(eq(assets.campusId, guest.campusId));

  // Attach each asset's most recent maintenance record ("batteries changed
  // 6/12", "X32 firmware updated") — the whole point of this board.
  const result = [];
  for (const r of rows) {
    const [lastMaintenance] = await db
      .select({
        description: maintenanceRecords.description,
        performedAt: maintenanceRecords.performedAt,
        nextDueDate: maintenanceRecords.nextDueDate,
      })
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.assetId, r.asset.id))
      .orderBy(desc(maintenanceRecords.performedAt))
      .limit(1);
    result.push({
      id: r.asset.id,
      assetTag: r.asset.assetTag,
      brand: r.model.brand,
      modelName: r.model.modelName,
      category: r.categoryName,
      status: r.asset.status,
      assignedToName: r.asset.assignedToName,
      notes: r.asset.notes,
      lastMaintenance: lastMaintenance ?? null,
    });
  }

  return c.json({ assets: result });
});

app.get("/wifi", requireGuest, async (c) => {
  const guest = c.get("guest");
  if (guest.scope !== "wifi") return c.json({ error: "This code doesn't cover WiFi" }, 403);

  // Guest-only by default; a pass can opt into all networks (e.g. Leadership).
  const db = drizzle(c.env.DB);
  const where = guest.wifiAllNetworks
    ? eq(wifiNetworks.campusId, guest.campusId)
    : and(eq(wifiNetworks.campusId, guest.campusId), eq(wifiNetworks.isGuest, true));
  const rows = await db.select().from(wifiNetworks).where(where);

  const networks = [];
  for (const n of rows) {
    networks.push({
      id: n.id,
      ssid: n.ssid,
      password: await decryptSecret(n.passwordEncrypted, c.env.WIFI_ENCRYPTION_KEY),
      securityType: n.securityType,
      band: n.band,
      isGuest: n.isGuest,
      notes: n.notes,
    });
  }

  await logAudit(c.env, {
    userId: null,
    action: "wifi_viewed_via_pass",
    entityType: "access_pass",
    entityId: guest.passId,
    details: { label: guest.label, networkCount: networks.length },
    ipAddress: c.req.header("cf-connecting-ip") ?? null,
  });

  return c.json({ networks });
});

export default app;
