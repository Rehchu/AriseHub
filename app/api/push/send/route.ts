import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST { profileId, title, body, url } — sends a Web Push to every device that
// `profileId` has subscribed. Caller must be authenticated. Dead subscriptions
// (410/404) are pruned. The VAPID private key stays server-side only.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@arisehub.app";
  if (!pub || !priv) {
    return NextResponse.json({ error: "push not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(subject, pub, priv);

  const { profileId, title, body, url } = (await req.json()) as {
    profileId?: string;
    title?: string;
    body?: string;
    url?: string;
  };
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId);

  const payload = JSON.stringify({
    title: title || "AriseHub",
    body: body || "You have a new notification.",
    url: url || "/dashboard",
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

  return NextResponse.json({ sent, pruned: dead.length });
}
