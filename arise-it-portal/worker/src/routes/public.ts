import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { desc, sql } from "drizzle-orm";
import { campuses, tickets } from "../db/schema";
import { logAudit } from "../lib/audit";
import { isRateLimited } from "../lib/rate-limit";
import { notifyNewTicket } from "../lib/notify";
import { verifySsoCode } from "../lib/sso-code";
import type { Env, Variables } from "../types";

// Public, unauthenticated endpoints for the no-account request form.
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/campuses", async (c) => {
  const db = drizzle(c.env.DB);
  const all = await db.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(campuses.name);
  return c.json({ campuses: all });
});

app.post("/tickets", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const body = await c.req.json<{
    requesterName: string;
    requesterEmail?: string;
    campusId: number;
    category?: string;
    priority?: string;
    subject: string;
    description?: string;
    website?: string; // honeypot — real users never see or fill this field
  }>();

  // Bots that autofill every field get a fake success and no ticket.
  if (body.website) return c.json({ ok: true }, 201);

  if (!body.requesterName?.trim() || !body.subject?.trim() || !body.campusId) {
    return c.json({ error: "Name, campus, and a short description of the issue are required" }, 400);
  }

  if (await isRateLimited(c.env, "public_ticket_created", ip, { limit: 5, windowMinutes: 10 })) {
    return c.json({ error: "Too many requests — please wait a few minutes and try again" }, 429);
  }

  const allowedPriorities = ["low", "medium", "high"]; // public form can't file "urgent"
  const priority = allowedPriorities.includes(body.priority ?? "") ? body.priority : "medium";
  const allowedCategories = ["hardware", "software", "network", "account", "other"];
  const category = allowedCategories.includes(body.category ?? "") ? body.category : "other";

  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(tickets)
    .values({
      subject: body.subject.trim().slice(0, 200),
      description: body.description?.trim().slice(0, 5000),
      requesterName: body.requesterName.trim().slice(0, 100),
      requesterEmail: body.requesterEmail?.trim().slice(0, 200) || null,
      campusId: body.campusId,
      category: category as any,
      priority: priority as any,
    })
    .returning();

  await logAudit(c.env, {
    userId: null,
    action: "public_ticket_created",
    entityType: "ticket",
    entityId: created.id,
    details: { requesterName: created.requesterName },
    ipAddress: ip,
  });

  await notifyNewTicket(c.env, created, new URL(c.req.url).origin);

  return c.json({ ok: true, ticketId: created.id }, 201);
});

/**
 * The tickets belonging to whoever holds this AriseHub hand-off code.
 *
 * AriseHub shows these on its dashboard. It cannot use /api/tickets because the
 * browser has no session here, and it should not: that route is for portal
 * staff and returns everyone's tickets.
 *
 * The email comes from INSIDE the signed code and never from a query parameter.
 * That distinction is the whole security of this endpoint — an `?email=` here
 * would let anyone read anyone's tickets by guessing an address.
 *
 * Same 60-second HMAC code as the sign-in hand-off, same shared secret. It is a
 * bearer credential for its short life, so it is never logged.
 */
app.get("/my-tickets", async (c) => {
  const secret = c.env.SSO_SHARED_SECRET;
  if (!secret) return c.json({ error: "SSO is not configured" }, 503);

  const code = c.req.query("c");
  if (!code) return c.json({ error: "Not authenticated" }, 401);

  const email = await verifySsoCode(code, secret);
  if (!email) return c.json({ error: "Not authenticated" }, 401);

  const db = drizzle(c.env.DB);
  // Matched on requesterEmail, lowercased both sides — verifySsoCode already
  // lowercases, and addresses are entered by hand on the public form.
  const rows = await db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      status: tickets.status,
      priority: tickets.priority,
      updatedAt: tickets.updatedAt,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(sql`lower(${tickets.requesterEmail}) = ${email}`)
    .orderBy(desc(tickets.updatedAt))
    .limit(20);

  const origin = new URL(c.req.url).origin;
  return c.json({
    tickets: rows.map((t) => ({
      id: String(t.id),
      subject: t.subject,
      // AriseHub renders the status as a label, so send something readable
      // rather than the enum's underscore.
      status: t.status.replace(/_/g, " "),
      priority: t.priority,
      updated_at: t.updatedAt,
      created_at: t.createdAt,
      url: `${origin}/requests/${t.id}`,
    })),
  });
});

export default app;
