import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/webpush";

// POST { profileId, title, body, url } — sends a Web Push to every device that
// `profileId` has subscribed. Caller must be authenticated. Dead subscriptions
// (404/410) are pruned. Uses Web Crypto (see lib/webpush.ts) so it runs on
// Cloudflare Workers — the `web-push` npm package needs Node APIs and fails there.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@arisehub.app";
  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { error: "push not configured", detail: "VAPID keys missing on the server" },
      { status: 500 },
    );
  }

  const { profileId, title, body, url } = (await req.json()) as {
    profileId?: string;
    title?: string;
    body?: string;
    url?: string;
  };
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  // A push lands on someone's lock screen with whatever title we're handed, so
  // "any signed-in user may notify anyone" is an impersonation channel. You may
  // always notify yourself (the test button); notifying someone else is for the
  // people who legitimately assign work: leadership, IT, staff, department leads.
  const { data: meRow } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  const me = meRow as { id: string; role: string } | null;
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  if (me.id !== profileId) {
    const privileged = ["Super_Admin", "IT_Admin", "Staff"].includes(me.role);
    let allowed = privileged;
    if (!allowed) {
      const { data: lead } = await supabase.rpc("is_any_department_lead");
      allowed = lead === true;
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "You can only send notifications to yourself." },
        { status: 403 },
      );
    }
  }

  // Never let a caller point a notification at another site.
  const safeUrl = typeof url === "string" && /^\/(?!\/)/.test(url) ? url : "/dashboard";

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId);

  if (error) {
    return NextResponse.json({ error: "lookup failed", detail: error.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    // Surfaced to the UI so "nothing happened" is explainable.
    return NextResponse.json(
      { sent: 0, pruned: 0, detail: "No devices are subscribed for this person yet." },
      { status: 200 },
    );
  }

  const payload = JSON.stringify({
    title: title || "AriseHub",
    body: body || "You have a new notification.",
    url: safeUrl,
  });

  let sent = 0;
  let retried = 0;
  const dead: string[] = [];
  /** Status AND the push service's own explanation, plus which service it was. */
  const failures: { status: number; service: string; detail?: string }[] = [];

  await Promise.all(
    subs.map(async (s) => {
      const r = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload,
        { publicKey, privateKey, subject },
      );
      if (r.retried) retried++;
      if (r.ok) sent++;
      else if (r.expired) dead.push(s.id);
      else {
        let service = "unknown";
        try {
          service = new URL(s.endpoint).host;
        } catch {
          // A malformed endpoint is itself worth knowing about.
        }
        failures.push({ status: r.status, service, detail: r.detail });
      }
    }),
  );

  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

  return NextResponse.json({
    sent,
    pruned: dead.length,
    failed: failures.length,
    ...(retried ? { retried } : {}),
    // Reported so a failure can be diagnosed from the device that saw it. A
    // bare status number told us nothing: 525 is Cloudflare's, not Apple's, and
    // without the service host and the body there was no way to tell whether
    // the problem was the subscription, our JWT, or the hop in between.
    ...(failures.length ? { failures } : {}),
  });
}
