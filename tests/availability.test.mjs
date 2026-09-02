// Availability: can this person serve on this date?
//
// THE BUG THIS GUARDS AGAINST
// The scheduler builds every Date from a "yyyy-mm-dd" string and then reads the
// LOCAL calendar day back off it — see ScheduleMatrix.tsx / ScheduleCalendar.tsx
// / PlanDetail.tsx, all of which format with getFullYear()/getMonth()/getDate()
// and compute the weekday with getDay(). So availability.ts must also read the
// Date in LOCAL time.
//
// It didn't. Its internal `ymd()` used `toISOString()`, which converts to UTC.
// Whenever a Date's local calendar day differs from its UTC calendar day — which
// happens for part of every day, in every timezone that isn't exactly UTC — the
// blockout comparison used a day string one off from the weekday check. A person
// could read "available" on a day they blocked out, and "blocked" on the day
// next to it.
//
// PROVING IT WITHOUT DEPENDING ON THE MACHINE'S TIMEZONE
// `toISOString()` splits from the local day at a time-of-day that depends on the
// offset. To catch it on any machine, we test the invariant directly for a Date
// early in the day AND a Date late in the day: whatever the offset's sign, one of
// those two straddles the UTC date boundary. The public surface has no `ymd`, so
// we exercise it through a single-day blockout, which is exactly the path that
// broke.
//
// Pure arithmetic over Dates — no network, so these always run.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { availabilityFor, weekOfMonth } = await import("../lib/availability.ts");

// Given a "yyyy-mm-dd", a person blocked out for exactly that one day should
// read "blocked" for a Date anywhere within that local day, and "available" for
// a Date on the neighbouring days. We probe three instants inside the target
// day — its start, its middle, and its last minute — because the UTC boundary
// falls at a different clock time depending on the machine's offset, and at
// least one of these lands on the far side of it whenever the offset isn't zero.
function blockedOn(day) {
  const blockouts = [
    { id: "b", profile_id: "p", starts_on: day, ends_on: day, reason: "Away" },
  ];
  return (isoInstant) =>
    availabilityFor("p", new Date(isoInstant), blockouts, []).state;
}

describe("availabilityFor — a one-day blockout stays on that local day", () => {
  const day = "2026-08-30";
  const check = blockedOn(day);

  test("blocked at the start of the blocked day", () => {
    assert.equal(check("2026-08-30T00:00:00"), "blocked");
  });

  test("blocked in the middle of the blocked day", () => {
    assert.equal(check("2026-08-30T12:00:00"), "blocked");
  });

  test("blocked at the last minute of the blocked day", () => {
    // On a UTC-negative machine this instant is already the NEXT day in UTC,
    // so the old toISOString()-based code read it as "available".
    assert.equal(check("2026-08-30T23:59:00"), "blocked");
  });

  test("free the day before", () => {
    assert.equal(check("2026-08-29T12:00:00"), "available");
  });

  test("free the day after", () => {
    assert.equal(check("2026-08-31T12:00:00"), "available");
  });
});

describe("weekOfMonth — counts by the local calendar day", () => {
  test("the 1st of a month is week 1, not week 0", () => {
    assert.equal(weekOfMonth(new Date("2026-08-01T12:00:00")), 1);
  });

  test("the 8th is week 2", () => {
    assert.equal(weekOfMonth(new Date("2026-08-08T12:00:00")), 2);
  });

  test("Aug 30 2026 is the 5th occurrence of its weekday", () => {
    assert.equal(weekOfMonth(new Date("2026-08-30T12:00:00")), 5);
  });
});

describe("availabilityFor — serving pattern matches the picked weekday", () => {
  test("a Sunday-only server is available on a Sunday, off-pattern on a Monday", () => {
    const patterns = [
      { id: "sp", profile_id: "q", weekday: 0, weeks: [], note: null },
    ];
    // Aug 30 2026 is a Sunday; Aug 31 a Monday. Probe the last minute of each
    // local day — the instant the UTC-based code slipped to the wrong weekday.
    assert.equal(
      availabilityFor("q", new Date("2026-08-30T23:59:00"), [], patterns).state,
      "available",
      "Sunday server is available on Sunday, even late in the day",
    );
    assert.equal(
      availabilityFor("q", new Date("2026-08-31T23:59:00"), [], patterns).state,
      "off-pattern",
      "Sunday server does not serve Monday",
    );
  });

  test("first-Sunday-only server is off-pattern on the 5th Sunday", () => {
    const patterns = [
      { id: "sp2", profile_id: "r", weekday: 0, weeks: [1], note: null },
    ];
    assert.equal(
      availabilityFor("r", new Date("2026-08-30T12:00:00"), [], patterns).state,
      "off-pattern",
      "5th Sunday is not the 1st Sunday",
    );
  });
});
