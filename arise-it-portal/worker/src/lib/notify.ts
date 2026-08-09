import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { users, campuses } from "../db/schema";
import { sendTicketNotification, sendStatusChange } from "./email";
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

/** How a status reads to the person waiting, rather than to us. */
const STATUS_COPY: Record<string, { line: string; heading: string }> = {
  open: { heading: "Your request is open", line: "It's in the queue and someone will pick it up." },
  in_progress: { heading: "Someone's on it", line: "Your request is being worked on now." },
  waiting: {
    heading: "We need something from you",
    line: "Your request is on hold until we hear back — check the portal for what's needed.",
  },
  resolved: {
    heading: "Your request is sorted",
    line: "We've marked it resolved. If it isn't, reply in the portal and we'll reopen it.",
  },
  closed: { heading: "Your request is closed", line: "Nothing further is needed." },
};

/**
 * Tell the requester their ticket moved.
 *
 * Only on a genuine status transition, and only to the person who raised it.
 * Fail-soft in the same way as everything else here: a status change must land
 * whether or not the email does.
 *
 * NOT sent when the person changing the status is the requester — they already
 * know, and an email confirming your own click is noise that teaches people to
 * filter these out.
 */
export async function notifyStatusChange(
  env: Env,
  ticket: {
    id: number;
    subject: string;
    status: string;
    requesterUserId: number | null;
    requesterEmail: string | null;
  },
  changedByUserId: number,
  baseUrl: string
): Promise<boolean> {
  try {
    if (ticket.requesterUserId && ticket.requesterUserId === changedByUserId) return false;

    const db = drizzle(env.DB);
    // Public tickets carry the address they typed; staff tickets resolve it.
    let to = ticket.requesterEmail ?? null;
    if (!to && ticket.requesterUserId) {
      const [u] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, ticket.requesterUserId))
        .limit(1);
      to = u?.email ?? null;
    }
    if (!to) return false;

    const copy = STATUS_COPY[ticket.status] ?? {
      heading: "Your request was updated",
      line: `It's now marked "${ticket.status.replace(/_/g, " ")}".`,
    };

    return await sendStatusChange(env, {
      to,
      heading: copy.heading,
      line: copy.line,
      subject: ticket.subject,
      status: ticket.status.replace(/_/g, " "),
      ticketUrl: `${baseUrl}/requests/${ticket.id}`,
    });
  } catch (err) {
    console.error("notifyStatusChange error", err);
    return false;
  }
}
