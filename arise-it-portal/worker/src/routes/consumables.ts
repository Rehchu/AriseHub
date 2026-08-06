import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { consumables } from "../db/schema";
import { requireAuth, requireRole, campusFilter } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const scopedCampusId = campusFilter(user);
  const rows =
    scopedCampusId !== undefined
      ? await db.select().from(consumables).where(eq(consumables.campusId, scopedCampusId))
      : await db.select().from(consumables);
  return c.json({ consumables: rows });
});

app.post("/", requireRole("super_admin", "campus_admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name: string;
    category?: string;
    campusId: number;
    quantityOnHand?: number;
    reorderThreshold?: number;
    notes?: string;
  }>();
  if (!body.name || !body.campusId) return c.json({ error: "name and campusId are required" }, 400);
  if (user.role === "campus_admin" && user.campusId !== body.campusId) return c.json({ error: "Forbidden" }, 403);

  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(consumables)
    .values({
      name: body.name,
      category: body.category,
      campusId: body.campusId,
      quantityOnHand: body.quantityOnHand ?? 0,
      reorderThreshold: body.reorderThreshold ?? 0,
      notes: body.notes,
    })
    .returning();

  await logAudit(c.env, { userId: user.id, action: "created", entityType: "consumable", entityId: created.id });
  return c.json({ consumable: created }, 201);
});

app.put("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; category?: string; reorderThreshold?: number; notes?: string }>();

  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(consumables).where(eq(consumables.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  const [updated] = await db
    .update(consumables)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(consumables.id, id))
    .returning();
  await logAudit(c.env, { userId: user.id, action: "updated", entityType: "consumable", entityId: id });
  return c.json({ consumable: updated });
});

app.post("/:id/adjust", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const { delta, notes } = await c.req.json<{ delta: number; notes?: string }>();
  if (typeof delta !== "number" || delta === 0) return c.json({ error: "delta must be a non-zero number" }, 400);

  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(consumables).where(eq(consumables.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  const newQuantity = Math.max(0, existing.quantityOnHand + delta);
  const [updated] = await db
    .update(consumables)
    .set({ quantityOnHand: newQuantity, updatedAt: new Date().toISOString() })
    .where(eq(consumables.id, id))
    .returning();

  await logAudit(c.env, {
    userId: user.id,
    action: "quantity_adjusted",
    entityType: "consumable",
    entityId: id,
    details: { delta, newQuantity, notes },
  });
  return c.json({ consumable: updated });
});

app.delete("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(consumables).where(eq(consumables.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  await db.delete(consumables).where(eq(consumables.id, id));
  await logAudit(c.env, { userId: user.id, action: "deleted", entityType: "consumable", entityId: id });
  return c.json({ ok: true });
});

export default app;
