import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { users, campuses } from "../db/schema";
import { sendTicketNotification } from "./email";
import type { Env } from "../types";

// Emails active super-admins when a new ticket is created (public or staff).
// Fail-soft: never throws; ticket creation must succeed regardless.
export async function notifyNewTicket(
  env: Env,
  ticket: {
    id: number;
    subject: string;
    priority: string;
    category: string;
    campusId: number;
    requesterUserId: number | null;
    requesterName: string | null;
    description?: string | null;
  },
  baseUrl: string
): Promise<boolean> {
  try {
    const db = drizzle(env.DB);
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.role, "super_admin"), eq(users.active, true)));
    const to = admins.map((a) => a.email);
    if (!to.length) return false;

    let requesterName = ticket.requesterName ?? "";
    if (!requesterName && ticket.requesterUserId) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, ticket.requesterUserId)).limit(1);
      requesterName = u?.name ?? "A staff member";
    }
    const [campus] = await db.select({ name: campuses.name }).from(campuses).where(eq(campuses.id, ticket.campusId)).limit(1);

    return await sendTicketNotification(env, {
      to,
      subject: ticket.subject,
      requesterName: requesterName || "Someone",
      priority: ticket.priority,
      category: ticket.category,
      campusName: campus?.name ?? "",
      description: ticket.description,
      ticketUrl: `${baseUrl}/requests/${ticket.id}`,
    });
  } catch (err) {
    console.error("notifyNewTicket error", err);
    return false;
  }
}
