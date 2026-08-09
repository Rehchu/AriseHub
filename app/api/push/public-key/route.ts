import { NextResponse } from "next/server";

// The VAPID public key, for the service worker.
//
// Public by definition — it is compiled into every client bundle already as
// NEXT_PUBLIC_VAPID_PUBLIC_KEY. The service worker needs it to re-subscribe on
// pushsubscriptionchange, and a service worker has no access to the page's
// environment, so it has to ask.
export function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "push not configured" }, { status: 500 });
  return NextResponse.json({ key });
}
