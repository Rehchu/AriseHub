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
    url: url || "/dashboard",
  });

  let sent = 0;
  const dead: string[] = [];
  const failures: number[] = [];

  await Promise.all(
    subs.map(async (s) => {
      const r = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload,
        { publicKey, privateKey, subject },
      );
      if (r.ok) sent++;
      else if (r.expired) dead.push(s.id);
      else failures.push(r.status);
    }),
  );

  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

  return NextResponse.json({
    sent,
    pruned: dead.length,
    failed: failures.length,
    ...(failures.length ? { failureStatuses: failures } : {}),
  });
}
