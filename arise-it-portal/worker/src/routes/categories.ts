import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { categories, assetModels } from "../db/schema";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const all = await db.select().from(categories).orderBy(categories.name);
  return c.json({ categories: all });
});

app.post("/", requireRole("super_admin", "campus_admin"), async (c) => {
  const body = await c.req.json<{ name: string; icon?: string }>();
  if (!body.name) return c.json({ error: "Name is required" }, 400);
  const db = drizzle(c.env.DB);
  const [created] = await db.insert(categories).values(body).returning();
  await logAudit(c.env, { userId: c.get("user").id, action: "created", entityType: "category", entityId: created.id });
  return c.json({ category: created }, 201);
});

app.delete("/:id", requireRole("super_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.delete(categories).where(eq(categories.id, id));
  await logAudit(c.env, { userId: c.get("user").id, action: "deleted", entityType: "category", entityId: id });
  return c.json({ ok: true });
});

// --- Asset models (reusable brand/model templates) ---

app.get("/models/all", async (c) => {
  const db = drizzle(c.env.DB);
  const all = await db.select().from(assetModels);
  return c.json({ models: all });
});

app.post("/models", requireRole("super_admin", "campus_admin"), async (c) => {
  const body = await c.req.json<{ categoryId: number; brand: string; modelName: string; specs?: string }>();
  if (!body.categoryId || !body.brand || !body.modelName) {
    return c.json({ error: "categoryId, brand, and modelName are required" }, 400);
  }
  const db = drizzle(c.env.DB);
  const [created] = await db.insert(assetModels).values(body).returning();
  await logAudit(c.env, { userId: c.get("user").id, action: "created", entityType: "asset_model", entityId: created.id });
  return c.json({ model: created }, 201);
});

app.delete("/models/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.delete(assetModels).where(eq(assetModels.id, id));
  await logAudit(c.env, { userId: c.get("user").id, action: "deleted", entityType: "asset_model", entityId: id });
  return c.json({ ok: true });
});

export default app;
