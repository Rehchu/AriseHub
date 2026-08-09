import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailLayout, buttonHtml } from "@/lib/email";
import { sendPush, relayFromEnv } from "@/lib/webpush";

const APP = "https://arisehub.myfaithtech.com";

// Scheduled reminders and the weekly digest.
//
// A scheduler nobody hears from gets ignored, so this is what turns "I'm on the
// rota" into "I showed up":
//
//   * tomorrow    — push + email to anyone serving tomorrow
//   * weekly      — Sunday-ahead digest of your week (email, for people who
//                   never installed the PWA)
//
// Triggered by Cloudflare Cron. Gated by CRON_SECRET so the endpoint can't be
// fired by anyone who finds it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Header only. This also accepted `?key=`, which puts the secret into
  // Cloudflare access logs, Referer headers and browser history — and
  // /api/cron/ is on the middleware's public allowlist, so the URL is reachable
  // by anyone. Compared in constant time rather than with !==.
  const provided = req.headers.get("x-cron-secret") ?? "";
  const ok =
    !!secret &&
    provided.length === secret.length &&
    provided.split("").reduce((d, c, i) => d | (c.charCodeAt(0) ^ secret.charCodeAt(i)), 0) === 0;
  if (!ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const job = new URL(req.url).searchParams.get("job") ?? "tomorrow";
  const admin = createAdminClient();

  const vapid = {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:admin@arisehub.app",
  };

  async function pushTo(profileId: string, title: string, body: string, url: string) {
    if (!vapid.publicKey || !vapid.privateKey) return;
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("profile_id", profileId);
    const payload = JSON.stringify({ title, body, url });
    const dead: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (s) => {
        const r = await sendPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          payload,
          vapid,
          { relay: relayFromEnv() },
        );
        if (r.expired) dead.push(s.id);
      }),
    );
    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  }

  // ---------------------------------------------------------------- tomorrow
  if (job === "tomorrow") {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: plans } = await admin
      .from("service_plans")
      .select("id, title, service_date")
      .eq("service_date", tomorrow);

    if (!plans || plans.length === 0) {
      return NextResponse.json({ job, notified: 0, detail: "nothing scheduled tomorrow" });
    }

    const planIds = (plans as { id: string }[]).map((p) => p.id);
    const { data: assignments } = await admin
      .from("plan_assignments")
      .select("plan_id, position, profile_id, status, profiles!plan_assignments_profile_id_fkey(full_name, email)")
      .in("plan_id", planIds)
      .neq("status", "declined");

    let notified = 0;
    for (const a of (assignments ?? []) as unknown as Array<{
      plan_id: string;
      position: string;
      profile_id: string | null;
      profiles: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null;
    }>) {
      if (!a.profile_id) continue;
      const who = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
      const plan = (plans as { id: string; title: string }[]).find((p) => p.id === a.plan_id);
      const when = new Date(tomorrow + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

      await pushTo(
        a.profile_id,
        "Serving tomorrow",
        `${plan?.title ?? "Service"} — ${a.position}`,
        "/services/my",
      );

      if (who?.email) {
        await sendEmail({
          to: who.email,
          subject: `Reminder: you're serving tomorrow — ${a.position}`,
          html: emailLayout(
            "You're serving tomorrow",
            `<p style="color:#34353b;font-size:15px;line-height:1.5">
               Hi ${who.full_name.split(" ")[0]}, a reminder that you're scheduled on
               <strong>${a.position}</strong> for <strong>${plan?.title ?? "service"}</strong>
               on ${when}.
             </p>
             ${buttonHtml(`${APP}/services/my`, "View my schedule")}
             <p style="color:#6d6e76;font-size:13px">
               Can't make it? Open your schedule and let the team know as early as you can.
             </p>`,
          ),
        });
      }
      notified++;
    }
    return NextResponse.json({ job, notified });
  }

  // ------------------------------------------------------------------ weekly
  if (job === "weekly") {
    const today = new Date().toISOString().slice(0, 10);
    const weekOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: plans } = await admin
      .from("service_plans")
      .select("id, title, service_date")
      .gte("service_date", today)
      .lte("service_date", weekOut);

    if (!plans || plans.length === 0) {
      return NextResponse.json({ job, sent: 0, detail: "nothing scheduled this week" });
    }

    const planIds = (plans as { id: string }[]).map((p) => p.id);
    const { data: assignments } = await admin
      .from("plan_assignments")
      .select("plan_id, position, profile_id, profiles!plan_assignments_profile_id_fkey(full_name, email)")
      .in("plan_id", planIds)
      .neq("status", "declined");

    // Group by person so everyone gets one email, not one per assignment.
    const perPerson: Record<string, { name: string; email: string; rows: string[] }> = {};
    for (const a of (assignments ?? []) as unknown as Array<{
      plan_id: string;
      position: string;
      profile_id: string | null;
      profiles: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null;
    }>) {
      if (!a.profile_id) continue;
      const who = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
      if (!who?.email) continue;
      const plan = (plans as { id: string; title: string; service_date: string }[]).find(
        (p) => p.id === a.plan_id,
      );
      const when = plan
        ? new Date(plan.service_date + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })
        : "";
      (perPerson[a.profile_id] ??= { name: who.full_name, email: who.email, rows: [] }).rows.push(
        `<li style="margin-bottom:6px"><strong>${when}</strong> — ${plan?.title ?? "Service"} · ${a.position}</li>`,
      );
    }

    let sent = 0;
    for (const p of Object.values(perPerson)) {
      const ok = await sendEmail({
        to: p.email,
        subject: `Your week at Arise — ${p.rows.length} time${p.rows.length === 1 ? "" : "s"} serving`,
        html: emailLayout(
          "Your week ahead",
          `<p style="color:#34353b;font-size:15px;line-height:1.5">
             Hi ${p.name.split(" ")[0]}, here's where you're serving this week:
           </p>
           <ul style="color:#34353b;font-size:15px;padding-left:18px">${p.rows.join("")}</ul>
           ${buttonHtml(`${APP}/services/my`, "View my schedule")}
           <p style="color:#6d6e76;font-size:13px">
             You'll also see who else is on your team, and can accept or decline there.
           </p>`,
        ),
      });
      if (ok.ok) sent++;
    }
    return NextResponse.json({ job, sent });
  }

  return NextResponse.json({ error: "unknown job" }, { status: 400 });
}
