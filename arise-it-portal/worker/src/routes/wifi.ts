import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { wifiNetworks } from "../db/schema";
import { requireAuth, requireRole, campusFilter } from "../lib/auth-middleware";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

// List networks with passwords masked.
app.get("/", async (c) => {
  const user = c.get("user");
  const scopedCampusId = campusFilter(user, c.req.query("campusId") ? Number(c.req.query("campusId")) : undefined);
  const db = drizzle(c.env.DB);
  const rows =
    scopedCampusId !== undefined
      ? await db.select().from(wifiNetworks).where(eq(wifiNetworks.campusId, scopedCampusId))
      : await db.select().from(wifiNetworks);

  return c.json({
    networks: rows.map(({ passwordEncrypted, ...rest }) => ({ ...rest, password: "••••••••" })),
  });
});

// Reveal the decrypted password for one network — audit logged.
app.get("/:id/reveal", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const [network] = await db.select().from(wifiNetworks).where(eq(wifiNetworks.id, id)).limit(1);
  if (!network) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== network.campusId) return c.json({ error: "Forbidden" }, 403);

  const password = await decryptSecret(network.passwordEncrypted, c.env.WIFI_ENCRYPTION_KEY);
  await logAudit(c.env, {
    userId: user.id,
    action: "wifi_password_revealed",
    entityType: "wifi_network",
    entityId: id,
    ipAddress: c.req.header("cf-connecting-ip") ?? null,
  });
  return c.json({ password });
});

app.post("/", requireRole("super_admin", "campus_admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    campusId: number;
    locationId?: number;
    ssid: string;
    password: string;
    securityType?: string;
    band?: string;
    vlan?: string;
    isGuest?: boolean;
    notes?: string;
  }>();
  if (!body.campusId || !body.ssid || !body.password) return c.json({ error: "campusId, ssid, and password are required" }, 400);
  if (user.role === "campus_admin" && user.campusId !== body.campusId) return c.json({ error: "Forbidden" }, 403);

  const passwordEncrypted = await encryptSecret(body.password, c.env.WIFI_ENCRYPTION_KEY);
  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(wifiNetworks)
    .values({
      campusId: body.campusId,
      locationId: body.locationId,
      ssid: body.ssid,
      passwordEncrypted,
      securityType: body.securityType ?? "WPA2",
      band: body.band,
      vlan: body.vlan,
      isGuest: body.isGuest ?? false,
      notes: body.notes,
      updatedBy: user.id,
    })
    .returning();

  await logAudit(c.env, { userId: user.id, action: "created", entityType: "wifi_network", entityId: created.id });
  const { passwordEncrypted: _omit, ...safe } = created;
  return c.json({ network: { ...safe, password: "••••••••" } }, 201);
});

app.put("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{
    ssid?: string;
    password?: string;
    securityType?: string;
    band?: string;
    vlan?: string;
    isGuest?: boolean;
    notes?: string;
  }>();

  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(wifiNetworks).where(eq(wifiNetworks.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  const updates: Record<string, unknown> = { ...body, updatedBy: user.id, updatedAt: new Date().toISOString() };
  delete updates.password;
  if (body.password) {
    updates.passwordEncrypted = await encryptSecret(body.password, c.env.WIFI_ENCRYPTION_KEY);
  }

  const [updated] = await db.update(wifiNetworks).set(updates).where(eq(wifiNetworks.id, id)).returning();
  await logAudit(c.env, { userId: user.id, action: "updated", entityType: "wifi_network", entityId: id });
  const { passwordEncrypted: _omit, ...safe } = updated;
  return c.json({ network: { ...safe, password: "••••••••" } });
});

app.delete("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(wifiNetworks).where(eq(wifiNetworks.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  await db.delete(wifiNetworks).where(eq(wifiNetworks.id, id));
  await logAudit(c.env, { userId: user.id, action: "deleted", entityType: "wifi_network", entityId: id });
  return c.json({ ok: true });
});

export default app;
