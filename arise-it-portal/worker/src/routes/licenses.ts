import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import { softwareLicenses, licenseAssignments, users } from "../db/schema";
import { requireAuth, requireRole, campusFilter } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

async function withSeatsUsed(db: ReturnType<typeof drizzle>, license: typeof softwareLicenses.$inferSelect) {
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)` })
    .from(licenseAssignments)
    .where(eq(licenseAssignments.licenseId, license.id))) as { count: number }[];
  return { ...license, seatsUsed: count };
}

app.get("/", async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const scopedCampusId = campusFilter(user);
  const rows =
    scopedCampusId !== undefined
      ? await db.select().from(softwareLicenses).where(eq(softwareLicenses.campusId, scopedCampusId))
      : await db.select().from(softwareLicenses);
  const withSeats = await Promise.all(rows.map((l) => withSeatsUsed(db, l)));
  return c.json({ licenses: withSeats });
});

app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const [license] = await db.select().from(softwareLicenses).where(eq(softwareLicenses.id, id)).limit(1);
  if (!license) return c.json({ error: "Not found" }, 404);

  const assignments = await db
    .select({ assignment: licenseAssignments, userName: users.name })
    .from(licenseAssignments)
    .innerJoin(users, eq(licenseAssignments.assignedToUserId, users.id))
    .where(eq(licenseAssignments.licenseId, id));

  return c.json({
    license: await withSeatsUsed(db, license),
    assignments: assignments.map((a) => ({ ...a.assignment, userName: a.userName })),
  });
});

app.post("/", requireRole("super_admin", "campus_admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name: string;
    vendor?: string;
    campusId?: number;
    seatsTotal?: number;
    renewalDate?: string;
    cost?: number;
    notes?: string;
  }>();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  if (user.role === "campus_admin" && body.campusId && user.campusId !== body.campusId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(softwareLicenses)
    .values({
      name: body.name,
      vendor: body.vendor,
      campusId: body.campusId,
      seatsTotal: body.seatsTotal ?? 1,
      renewalDate: body.renewalDate,
      cost: body.cost,
      notes: body.notes,
    })
    .returning();

  await logAudit(c.env, { userId: user.id, action: "created", entityType: "software_license", entityId: created.id });
  return c.json({ license: { ...created, seatsUsed: 0 } }, 201);
});

app.put("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{
    name?: string;
    vendor?: string;
    seatsTotal?: number;
    renewalDate?: string;
    cost?: number;
    notes?: string;
  }>();

  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(softwareLicenses).where(eq(softwareLicenses.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && existing.campusId && user.campusId !== existing.campusId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [updated] = await db
    .update(softwareLicenses)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(softwareLicenses.id, id))
    .returning();
  await logAudit(c.env, { userId: user.id, action: "updated", entityType: "software_license", entityId: id });
  return c.json({ license: await withSeatsUsed(db, updated) });
});

app.delete("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.delete(licenseAssignments).where(eq(licenseAssignments.licenseId, id));
  await db.delete(softwareLicenses).where(eq(softwareLicenses.id, id));
  await logAudit(c.env, { userId: c.get("user").id, action: "deleted", entityType: "software_license", entityId: id });
  return c.json({ ok: true });
});

app.post("/:id/assign", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const { assignedToUserId } = await c.req.json<{ assignedToUserId: number }>();
  if (!assignedToUserId) return c.json({ error: "assignedToUserId is required" }, 400);

  const db = drizzle(c.env.DB);
  const [license] = await db.select().from(softwareLicenses).where(eq(softwareLicenses.id, id)).limit(1);
  if (!license) return c.json({ error: "Not found" }, 404);

  const [{ count: seatsUsed }] = (await db
    .select({ count: sql<number>`count(*)` })
    .from(licenseAssignments)
    .where(eq(licenseAssignments.licenseId, id))) as { count: number }[];
  if (seatsUsed >= license.seatsTotal) return c.json({ error: "No seats available" }, 400);

  const [existing] = await db
    .select()
    .from(licenseAssignments)
    .where(and(eq(licenseAssignments.licenseId, id), eq(licenseAssignments.assignedToUserId, assignedToUserId)))
    .limit(1);
  if (existing) return c.json({ error: "Already assigned to this user" }, 400);

  const [assignment] = await db.insert(licenseAssignments).values({ licenseId: id, assignedToUserId }).returning();
  await logAudit(c.env, { userId: user.id, action: "seat_assigned", entityType: "software_license", entityId: id, details: { assignedToUserId } });
  return c.json({ assignment }, 201);
});

app.delete("/:id/assign/:userId", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const userId = Number(c.req.param("userId"));
  const db = drizzle(c.env.DB);
  await db.delete(licenseAssignments).where(and(eq(licenseAssignments.licenseId, id), eq(licenseAssignments.assignedToUserId, userId)));
  await logAudit(c.env, { userId: c.get("user").id, action: "seat_unassigned", entityType: "software_license", entityId: id, details: { userId } });
  return c.json({ ok: true });
});

export default app;
