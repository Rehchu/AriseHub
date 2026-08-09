import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, desc, isNull, like, or, sql } from "drizzle-orm";
import { tickets, ticketComments, users } from "../db/schema";
import { requireAuth, requireRole, campusFilter } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import { notifyNewTicket, notifyStatusChange } from "../lib/notify";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const user = c.get("user");
  const { status, priority, assignedToUserId, mine, unassigned, search } = c.req.query();
  const db = drizzle(c.env.DB);
  const scopedCampusId = campusFilter(user);

  const conditions = [];
  if (scopedCampusId !== undefined) conditions.push(eq(tickets.campusId, scopedCampusId));
  if (status) conditions.push(eq(tickets.status, status as any));
  if (priority) conditions.push(eq(tickets.priority, priority as any));
  if (assignedToUserId) conditions.push(eq(tickets.assignedToUserId, Number(assignedToUserId)));
  if (mine === "1") conditions.push(eq(tickets.assignedToUserId, user.id));
  if (unassigned === "1") conditions.push(isNull(tickets.assignedToUserId));
  if (search) conditions.push(or(like(tickets.subject, `%${search}%`), like(tickets.description, `%${search}%`)));

  const rows = await db
    .select({
      ticket: tickets,
      requesterName: sql<string>`coalesce(${users.name}, ${tickets.requesterName}, 'Unknown')`,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.requesterUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt));

  return c.json({
    tickets: rows.map((r) => ({ ...r.ticket, requesterName: r.requesterName, isGuest: r.ticket.requesterUserId === null })),
  });
});

app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const [row] = await db
    .select({ ticket: tickets, requesterName: sql<string>`coalesce(${users.name}, ${tickets.requesterName}, 'Unknown')` })
    .from(tickets)
    .leftJoin(users, eq(tickets.requesterUserId, users.id))
    .where(eq(tickets.id, id))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);

  const comments = await db
    .select({ comment: ticketComments, userName: users.name })
    .from(ticketComments)
    .innerJoin(users, eq(ticketComments.userId, users.id))
    .where(eq(ticketComments.ticketId, id))
    .orderBy(ticketComments.createdAt);

  return c.json({
    ticket: { ...row.ticket, requesterName: row.requesterName, isGuest: row.ticket.requesterUserId === null },
    comments: comments.map((r) => ({ ...r.comment, userName: r.userName })),
  });
});

app.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    subject: string;
    description?: string;
    campusId: number;
    category?: string;
    priority?: string;
  }>();
  if (!body.subject || !body.campusId) return c.json({ error: "subject and campusId are required" }, 400);

  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(tickets)
    .values({
      subject: body.subject,
      description: body.description,
      campusId: body.campusId,
      category: (body.category as any) ?? "other",
      priority: (body.priority as any) ?? "medium",
      requesterUserId: user.id,
    })
    .returning();

  await logAudit(c.env, { userId: user.id, action: "created", entityType: "ticket", entityId: created.id });
  await notifyNewTicket(c.env, created, new URL(c.req.url).origin);
  return c.json({ ticket: created }, 201);
});

app.put("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{
    status?: string;
    priority?: string;
    assignedToUserId?: number | null;
    dueAt?: string | null;
    subject?: string;
    description?: string;
    category?: string;
  }>();

  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  const [updated] = await db
    .update(tickets)
    .set({ ...(body as any), updatedAt: new Date().toISOString() })
    .where(eq(tickets.id, id))
    .returning();

  const statusChanged = !!body.status && body.status !== existing.status;

  await logAudit(c.env, {
    userId: user.id,
    action: statusChanged ? "status_change" : "updated",
    entityType: "ticket",
    entityId: id,
    details: body,
  });

  // Tell the requester, but only on a genuine transition — not on every edit to
  // a due date or a description. notifyStatusChange also declines to email
  // someone about their own click, and never throws, so the update stands
  // whether or not the mail goes out.
  if (statusChanged) {
    await notifyStatusChange(
      c.env,
      {
        id: updated.id,
        subject: updated.subject,
        status: updated.status,
        requesterUserId: updated.requesterUserId,
        requesterEmail: updated.requesterEmail,
      },
      user.id,
      new URL(c.req.url).origin,
    );
  }

  return c.json({ ticket: updated });
});

app.post("/:id/assign", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{ assignedToUserId?: number }>().catch(() => ({ assignedToUserId: undefined }));
  const assigneeId = body.assignedToUserId ?? user.id;

  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  const [updated] = await db
    .update(tickets)
    .set({ assignedToUserId: assigneeId, status: existing.status === "open" ? "in_progress" : existing.status, updatedAt: new Date().toISOString() })
    .where(eq(tickets.id, id))
    .returning();

  await logAudit(c.env, { userId: user.id, action: "assigned", entityType: "ticket", entityId: id, details: { assignedToUserId: assigneeId } });

  // Picking a ticket up moves it open -> in_progress, which is exactly the
  // transition a waiting requester most wants to hear about. It happens here
  // rather than through PUT /:id, so without this it would go out silently.
  if (updated.status !== existing.status) {
    await notifyStatusChange(
      c.env,
      {
        id: updated.id,
        subject: updated.subject,
        status: updated.status,
        requesterUserId: updated.requesterUserId,
        requesterEmail: updated.requesterEmail,
      },
      user.id,
      new URL(c.req.url).origin,
    );
  }

  return c.json({ ticket: updated });
});

app.post("/:id/comments", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const { body } = await c.req.json<{ body: string }>();
  if (!body) return c.json({ error: "body is required" }, 400);

  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (
    user.role === "viewer" &&
    existing.requesterUserId !== user.id &&
    existing.assignedToUserId !== user.id
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [comment] = await db.insert(ticketComments).values({ ticketId: id, userId: user.id, body }).returning();
  await db.update(tickets).set({ updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
  await logAudit(c.env, { userId: user.id, action: "commented", entityType: "ticket", entityId: id });
  return c.json({ comment }, 201);
});

export default app;
