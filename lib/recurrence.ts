// Event recurrence.
//
// Deliberately simple: weekly / fortnightly / monthly on the event's own
// weekday. Church schedules are regular, and full RRULE would bring an
// expansion engine and a pile of edge cases for no practical gain here.
//
// Occurrences are materialised as real event rows so room-conflict checking,
// approval and editing all work the same as any other event.

export type RepeatRule = "none" | "weekly" | "fortnightly" | "monthly";

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  none: "Does not repeat",
  weekly: "Every week",
  fortnightly: "Every 2 weeks",
  monthly: "Monthly (same weekday)",
};

/**
 * Dates for a series, excluding the first (which is the parent event itself).
 * Capped so a runaway "until" can't generate thousands of rows.
 */
export function occurrenceDates(
  start: Date,
  rule: RepeatRule,
  until: Date,
  max = 120,
): Date[] {
  if (rule === "none") return [];
  const out: Date[] = [];
  const cursor = new Date(start);

  for (let i = 0; i < max; i++) {
    if (rule === "weekly") cursor.setDate(cursor.getDate() + 7);
    else if (rule === "fortnightly") cursor.setDate(cursor.getDate() + 14);
    else {
      // Monthly on the same weekday-of-month (e.g. "2nd Tuesday"), which is how
      // churches actually schedule — not "the 14th".
      const weekday = start.getDay();
      const nth = Math.floor((start.getDate() - 1) / 7);
      cursor.setMonth(cursor.getMonth() + 1, 1);
      const first = cursor.getDay();
      const offset = (weekday - first + 7) % 7;
      cursor.setDate(1 + offset + nth * 7);
      cursor.setHours(start.getHours(), start.getMinutes(), 0, 0);
    }
    if (cursor > until) break;
    out.push(new Date(cursor));
  }
  return out;
}
