import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { campuses } from "../db/schema";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const all = await db.select().from(campuses).orderBy(campuses.name);
  return c.json({ campuses: all });
});

app.post("/", requireRole("super_admin"), async (c) => {
  const body = await c.req.json<{ name: string; address?: string; timezone?: string; notes?: string }>();
  if (!body.name) return c.json({ error: "Name is required" }, 400);
  const db = drizzle(c.env.DB);
  const [created] = await db.insert(campuses).values(body).returning();
  await logAudit(c.env, { userId: c.get("user").id, action: "created", entityType: "campus", entityId: created.id });
  return c.json({ campus: created }, 201);
});

app.put("/:id", requireRole("super_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name?: string; address?: string; timezone?: string; notes?: string }>();
  const db = drizzle(c.env.DB);
  const [updated] = await db.update(campuses).set(body).where(eq(campuses.id, id)).returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  await logAudit(c.env, { userId: c.get("user").id, action: "updated", entityType: "campus", entityId: id });
  return c.json({ campus: updated });
});

app.delete("/:id", requireRole("super_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.delete(campuses).where(eq(campuses.id, id));
  await logAudit(c.env, { userId: c.get("user").id, action: "deleted", entityType: "campus", entityId: id });
  return c.json({ ok: true });
});

export default app;
