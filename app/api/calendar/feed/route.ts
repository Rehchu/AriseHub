import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public iCal feed so people can subscribe from their phone's calendar.
//
// Only events explicitly marked PUBLIC and APPROVED are included — a room
// booking or a pending request must never leak into a feed anyone can fetch.
export async function GET(req: NextRequest) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("id, title, description, starts_at, ends_at, all_day, updated_at")
    .eq("is_public", true)
    .eq("status", "approved")
    .order("starts_at")
    .limit(500);

  const stamp = (iso: string, allDay = false) => {
    const d = new Date(iso);
    return allDay
      ? d.toISOString().slice(0, 10).replace(/-/g, "")
      : d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };
  const esc = (s: string) =>
    (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AriseHub//Arise Church//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Arise Church",
    "X-WR-TIMEZONE:America/Chicago",
  ];

  for (const e of (data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    updated_at: string;
  }>) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@arisehub.myfaithtech.com`,
      `DTSTAMP:${stamp(e.updated_at)}`,
      e.all_day
        ? `DTSTART;VALUE=DATE:${stamp(e.starts_at, true)}`
        : `DTSTART:${stamp(e.starts_at)}`,
      e.all_day ? `DTEND;VALUE=DATE:${stamp(e.ends_at, true)}` : `DTEND:${stamp(e.ends_at)}`,
      `SUMMARY:${esc(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="arise-church.ics"',
      "Cache-Control": "public, max-age=900",
    },
  });
}
