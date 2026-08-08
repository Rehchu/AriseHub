import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signSsoCode } from "@/lib/sso-code";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

export interface PortalTicket {
  id: string;
  subject: string;
  status: string;
  priority?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  url?: string | null;
}

/**
 * The signed-in person's IT tickets, for the dashboard.
 *
 * Server-side on purpose. The portal is a different Worker with its own
 * database, and the browser has no session there — so AriseHub mints the same
 * short-lived HMAC code it already uses for the SSO hand-off (lib/sso-code.ts),
 * which asserts only "this email is authenticated here", and asks the portal for
 * that email's tickets. The secret never reaches the client and no cross-origin
 * cookie is involved.
 *
 * DEGRADES QUIETLY. The portal endpoint does not exist yet — see
 * docs/it-portal-integration.md for the contract. Until it does this returns an
 * empty list with `available: false`, and the dashboard card renders nothing
 * rather than an error nobody can act on.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json({ tickets: [], available: false, reason: "sso not configured" });
  }

  try {
    // Long enough to survive a slow round trip, short enough to be worthless if
    // it leaked. Same 60s the hand-off uses.
    const code = await signSsoCode(user.email, secret);
    const res = await fetch(
      `${IT_PORTAL}/api/public/my-tickets?c=${encodeURIComponent(code)}`,
      {
        headers: { Accept: "application/json" },
        // The dashboard must never hang on the portal being slow or down.
        signal: AbortSignal.timeout(6000),
      },
    );

    if (res.status === 404) {
      // The endpoint isn't built yet. Not an error worth showing anyone.
      return NextResponse.json({ tickets: [], available: false, reason: "not implemented" });
    }
    if (!res.ok) {
      return NextResponse.json({ tickets: [], available: false, reason: `portal ${res.status}` });
    }

    const body = (await res.json()) as { tickets?: PortalTicket[] };
    return NextResponse.json({ tickets: body.tickets ?? [], available: true });
  } catch (e) {
    // Timeout, DNS, TLS — the dashboard shows the rest of itself regardless.
    return NextResponse.json({
      tickets: [],
      available: false,
      reason: e instanceof Error ? e.message : "unreachable",
    });
  }
}
