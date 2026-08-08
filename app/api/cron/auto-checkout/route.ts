import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Close out children nobody checked out.
 *
 * Volunteers do not check every child out — the parents collect them and
 * everyone goes home. Rows then sit in `checked_in` forever, so the roster is
 * wrong the following week and "currently checked in" means nothing.
 *
 * Cutoffs are stored as a LOCAL wall-clock time per weekday, not as UTC, and
 * resolved against each campus's own timezone. Sunday 13:30 in Pineville is
 * 18:30 UTC in summer and 19:30 UTC in winter; a UTC schedule would drift by an
 * hour twice a year and eventually start closing children out mid-service.
 *
 * Rows are closed with `checked_out_by` null and `auto_checked_out` true, which
 * is what distinguishes "the system tidied this up" from "a volunteer handed
 * this child to someone". The attendance record stays honest about the fact
 * that nobody was verified at pickup.
 */

/** Weekday, minutes-since-midnight and date, as they read in `tz` right now. */
function localNow(tz: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday] ?? 0;
  // Some ICU builds report midnight as hour 24 with hour12:false.
  const hour = Number(parts.hour) % 24;
  return { dow, minutes: hour * 60 + Number(parts.minute) };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Header only. The secret used to be accepted from the query string, which
  // puts it in access logs, referrers and browser history.
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: settings } = await admin
    .from("checkin_settings")
    .select("auto_checkout_enabled")
    .maybeSingle();
  if (!(settings as { auto_checkout_enabled?: boolean } | null)?.auto_checkout_enabled) {
    return NextResponse.json({ ok: true, skipped: "auto checkout disabled" });
  }

  const [{ data: rules }, { data: campuses }] = await Promise.all([
    admin.from("checkin_auto_checkout_rules").select("day_of_week, at_time, label").eq("active", true),
    admin.from("campuses").select("id, name, timezone"),
  ]);

  const ruleRows = (rules ?? []) as { day_of_week: number; at_time: string; label: string | null }[];
  const campusRows = (campuses ?? []) as { id: string; name: string; timezone: string | null }[];

  const report: { campus: string; rule: string; closed: number }[] = [];

  for (const campus of campusRows) {
    const tz = campus.timezone || "America/Chicago";
    const { dow, minutes } = localNow(tz, now);

    // The latest cutoff for today that has already passed.
    const passed = ruleRows
      .filter((r) => r.day_of_week === dow)
      .map((r) => {
        const [h, m] = r.at_time.split(":");
        return { ...r, mins: Number(h) * 60 + Number(m) };
      })
      .filter((r) => minutes >= r.mins)
      .sort((a, b) => b.mins - a.mins)[0];
    if (!passed) continue;

    // Derive the cutoff INSTANT from the same "now", so DST is already baked in
    // and a child checked in after the cutoff isn't closed out immediately.
    const cutoff = new Date(now.getTime() - (minutes - passed.mins) * 60_000);

    const { data: closed, error } = await admin
      .from("checkins")
      .update({
        status: "checked_out",
        checked_out_at: now.toISOString(),
        checked_out_by: null,
        auto_checked_out: true,
      })
      .eq("campus_id", campus.id)
      .eq("status", "checked_in")
      .lt("checked_in_at", cutoff.toISOString())
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message, campus: campus.name }, { status: 500 });
    }
    report.push({
      campus: campus.name,
      rule: passed.label ?? passed.at_time,
      closed: (closed ?? []).length,
    });
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), report });
}
