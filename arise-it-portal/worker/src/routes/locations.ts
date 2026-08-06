import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { locations } from "../db/schema";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const campusId = c.req.query("campusId");
  const db = drizzle(c.env.DB);
  const rows = campusId
    ? await db.select().from(locations).where(eq(locations.campusId, Number(campusId)))
    : await db.select().from(locations);
  return c.json({ locations: rows });
});

app.post("/", requireRole("super_admin", "campus_admin"), async (c) => {
  const body = await c.req.json<{ campusId: number; name: string; description?: string }>();
  if (!body.name || !body.campusId) return c.json({ error: "campusId and name are required" }, 400);
  const user = c.get("user");
  if (user.role === "campus_admin" && user.campusId !== body.campusId) {
    return c.json({ error: "Forbidden for this campus" }, 403);
  }
  const db = drizzle(c.env.DB);
  const [created] = await db.insert(locations).values(body).returning();
  await logAudit(c.env, { userId: user.id, action: "created", entityType: "location", entityId: created.id });
  return c.json({ location: created }, 201);
});

app.put("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name?: string; description?: string }>();
  const db = drizzle(c.env.DB);
  const [updated] = await db.update(locations).set(body).where(eq(locations.id, id)).returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  await logAudit(c.env, { userId: c.get("user").id, action: "updated", entityType: "location", entityId: id });
  return c.json({ location: updated });
});

app.delete("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.delete(locations).where(eq(locations.id, id));
  await logAudit(c.env, { userId: c.get("user").id, action: "deleted", entityType: "location", entityId: id });
  return c.json({ ok: true });
});

export default app;
