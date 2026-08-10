"use client";

import { useState } from "react";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { ScheduleMatrix, type SchedulePlan } from "./ScheduleMatrix";
import type { Blockout, ServingPattern } from "@/lib/availability";

/**
 * Two ways to look at the rota, toggled here.
 *
 * The month/week CALENDAR is the original view — it was dropped in the Nocturne
 * reskin, which left only the person-by-date MATRIX and no way to see the month
 * at a glance or open a Sunday that had no plan yet. The calendar is the default
 * (it's what the "Schedule calendar" link promises and what schedulers were used
 * to); the matrix stays available as the redesign's per-person status grid.
 */
export function ScheduleViews(props: {
  plans: SchedulePlan[];
  departments: { id: string; name: string }[];
  myDepartmentIds: string[];
  people: { id: string; full_name: string }[];
  blockouts: Blockout[];
  patterns: ServingPattern[];
  canManage: boolean;
  currentProfileId: string;
  today: string;
}) {
  const [view, setView] = useState<"calendar" | "matrix">("calendar");

  return (
    <div>
      <div className="mx-auto flex max-w-5xl gap-1 px-4 pt-6 sm:px-6">
        {(["calendar", "matrix"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition ${
              view === v
                ? "bg-accent text-onaccent"
                : "border border-ink-200 text-ink-600 hover:bg-ink-50"
            }`}
          >
            {v === "calendar" ? "Calendar" : "By person"}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <ScheduleCalendar
          plans={props.plans}
          departments={props.departments}
          myDepartmentIds={props.myDepartmentIds}
          people={props.people}
          blockouts={props.blockouts}
          patterns={props.patterns}
          canManage={props.canManage}
          currentProfileId={props.currentProfileId}
        />
      ) : (
        <ScheduleMatrix {...props} />
      )}
    </div>
  );
}
