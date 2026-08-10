import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, relayFromEnv } from "@/lib/webpush";

// POST { title?, body?, url? } — send a test notification to EVERY registered
// device, across every person. This is the "is it working for everyone?" check
// (the one that finally answers "is Kristina getting them?"): rather than
// testing device by device, ping all of them and report who came back.
//
// Broadcasting to everyone is privileged — a push lands on every lock screen —
// so it is gated to Super_Admin / IT_Admin / the IT department, the same people
// the settings page shows the test controls to.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: meRow } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  const me = meRow as { id: string; role: string } | null;
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  let allowed = me.role === "Super_Admin" || me.role === "IT_Admin";
  if (!allowed) {
    const { data: m } = await supabase
      .from("department_members")
      .select("id, departments!inner(slug)")
      .eq("profile_id", me.id)
      .eq("departments.slug", "it")
      .maybeSingle();
    allowed = !!m;
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "Only IT or a Super Admin can test everyone's devices." },
      { status: 403 },
    );
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@arisehub.app";
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "push not configured" }, { status: 500 });
  }

  const { title, body, url } = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    url?: string;
  };
  const safeUrl = typeof url === "string" && /^\/(?!\/)/.test(url) ? url : "/dashboard";
  const payload = JSON.stringify({
    title: title || "AriseHub test",
    body: body || "Test notification — every signed-up device should see this.",
    url: safeUrl,
  });

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, p256dh, auth");
  if (error) {
    return NextResponse.json({ error: "lookup failed", detail: error.message }, { status: 500 });
  }
  const all = (subs ?? []) as {
    id: string;
    profile_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  if (all.length === 0) {
    return NextResponse.json({ people: 0, devices: 0, sent: 0, failed: 0, detail: "Nobody has turned on notifications yet." });
  }

  const relay = relayFromEnv();
  const dead: string[] = [];
  const reached = new Set<string>();
  let sent = 0;
  let failed = 0;
  let relayed = 0;

  await Promise.all(
    all.map(async (s) => {
      const r = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload,
        { publicKey, privateKey, subject },
        { relay },
      );
      if (r.relayed) relayed++;
      if (r.ok) {
        sent++;
        reached.add(s.profile_id);
      } else if (r.expired) {
        dead.push(s.id);
      } else {
        failed++;
      }
      if (!r.expired) {
        await admin
          .from("push_subscriptions")
          .update({
            last_sent_at: new Date().toISOString(),
            last_status: r.ok ? `accepted${r.relayed ? " via relay" : ""}` : `failed (${r.status})`,
          })
          .eq("id", s.id);
      }
    }),
  );

  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

  const people = new Set(all.map((s) => s.profile_id)).size;
  return NextResponse.json({
    people,
    peopleReached: reached.size,
    devices: all.length,
    sent,
    failed,
    pruned: dead.length,
    ...(relayed ? { relayed } : {}),
  });
}
