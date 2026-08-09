import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Re-points a device's push registration after the browser rotated its endpoint.
//
// Called by the service worker's pushsubscriptionchange handler. Without it a
// rotation means the next send gets a 410, the row is pruned, and the device
// stops receiving with nothing anywhere to say so.
//
// Authenticated with the caller's own session cookie, which the service worker
// sends because the request is same-origin. Anonymous callers are refused —
// otherwise anyone could re-point somebody else's device at an endpoint they
// control and receive that person's notifications.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: meRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  const me = meRow as { id: string } | null;
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const { oldEndpoint, endpoint, p256dh, auth } = (await req.json()) as {
    oldEndpoint?: string | null;
    endpoint?: string;
    p256dh?: string;
    auth?: string;
  };
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "endpoint, p256dh and auth are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Drop the stale row first, and only ever one of OUR OWN: scoping the delete
  // by profile_id means a stolen or guessed endpoint cannot be used to unhook
  // somebody else's device.
  if (oldEndpoint && oldEndpoint !== endpoint) {
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", me.id)
      .eq("endpoint", oldEndpoint);
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      profile_id: me.id,
      endpoint,
      p256dh,
      auth,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return NextResponse.json({ error: "could not save", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
