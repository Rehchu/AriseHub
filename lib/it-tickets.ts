/**
 * Raising a ticket on the IT portal.
 *
 * One place, because there are two forms that do it — "Get IT Help" in the
 * shell and "Make a ticket" in a support thread — and they had already drifted
 * apart in a way that broke both.
 *
 * The portal REQUIRES campusId and neither form sent it, so every ticket raised
 * from AriseHub was rejected with a 400 and never created. The form said
 * "Sorry — something went wrong", which reads as a hiccup rather than "nothing
 * you have ever submitted arrived". Verified against the live endpoint.
 *
 * The vocabularies are the portal's and are checked server-side; anything it
 * does not recognise is silently coerced to "other"/"medium", so these lists
 * must match it exactly.
 */

export const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

export const TICKET_CATEGORIES = ["hardware", "software", "network", "account", "other"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high"] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface PortalCampus {
  id: number;
  name: string;
}

/** The portal's campuses. Its own ids — unrelated to AriseHub's campus uuids. */
export async function fetchPortalCampuses(): Promise<PortalCampus[]> {
  try {
    const res = await fetch(`${IT_PORTAL}/api/public/campuses`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { campuses?: PortalCampus[] };
    return body.campuses ?? [];
  } catch {
    return [];
  }
}

/**
 * Best guess at which portal campus someone belongs to, by name.
 *
 * The two systems have separate campus tables with no shared key, so matching on
 * the name is all there is. It only picks a DEFAULT — the form still shows the
 * choice, because guessing wrong silently would file a ticket at the wrong site.
 */
export function guessCampusId(campuses: PortalCampus[], myCampusName?: string | null): number | null {
  if (campuses.length === 0) return null;
  if (myCampusName) {
    const mine = myCampusName.toLowerCase();
    const exact = campuses.find((c) => c.name.toLowerCase() === mine);
    if (exact) return exact.id;
    // "Pineville" should find "Arise Church Pineville".
    const partial = campuses.find(
      (c) => c.name.toLowerCase().includes(mine) || mine.includes(c.name.toLowerCase()),
    );
    if (partial) return partial.id;
  }
  return campuses[0].id;
}

export interface RaiseTicketInput {
  requesterName: string;
  requesterEmail: string;
  campusId: number;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  /** Honeypot — the portal drops the request when it's filled. */
  website?: string;
}

export async function raiseTicket(
  input: RaiseTicketInput,
): Promise<{ ok: true; ticketId?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${IT_PORTAL}/api/public/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; ticketId?: string };
    if (!res.ok) {
      return {
        ok: false,
        // Surface what the portal actually said. "Something went wrong" is what
        // hid this bug for as long as it was hidden.
        error: body.error ?? `The portal refused it (${res.status})`,
      };
    }
    return { ok: true, ticketId: body.ticketId };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `${e.message}. You can also raise it at ${IT_PORTAL}/request`
          : "Couldn't reach the IT portal.",
    };
  }
}
