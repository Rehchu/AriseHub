// Scheduling helpers: turn blockouts + recurring patterns into a simple
// "can this person serve on this date?" answer that the scheduler UI can show.

export interface Blockout {
  id: string;
  profile_id: string;
  starts_on: string; // yyyy-mm-dd
  ends_on: string;
  reason: string | null;
}

export interface ServingPattern {
  id: string;
  profile_id: string;
  weekday: number; // 0=Sun
  weeks: number[]; // [] = every week
  note: string | null;
}

export type AvailabilityState = "available" | "blocked" | "off-pattern" | "unknown";

export interface AvailabilityResult {
  state: AvailabilityState;
  reason?: string;
}

/** Which occurrence of its weekday a date is within its month (1st, 2nd, …). */
export function weekOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Availability for one person on one date.
 *  - blocked      → they marked themselves away (hard signal, always wins)
 *  - off-pattern  → they have a pattern and this date isn't in it (soft signal)
 *  - available    → within pattern, or no pattern set
 */
export function availabilityFor(
  profileId: string,
  date: Date,
  blockouts: Blockout[],
  patterns: ServingPattern[],
): AvailabilityResult {
  const day = ymd(date);

  const block = blockouts.find(
    (b) => b.profile_id === profileId && b.starts_on <= day && b.ends_on >= day,
  );
  if (block) {
    return { state: "blocked", reason: block.reason || "Marked unavailable" };
  }

  const mine = patterns.filter((p) => p.profile_id === profileId);
  if (mine.length === 0) return { state: "available" };

  const wd = date.getDay();
  const forDay = mine.find((p) => p.weekday === wd);
  if (!forDay) {
    return { state: "off-pattern", reason: "Doesn't usually serve this day" };
  }
  if (forDay.weeks.length > 0 && !forDay.weeks.includes(weekOfMonth(date))) {
    const ord = ["", "1st", "2nd", "3rd", "4th", "5th"];
    return {
      state: "off-pattern",
      reason: `Usually serves the ${forDay.weeks.map((w) => ord[w]).join(" & ")}`,
    };
  }
  return { state: "available" };
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
