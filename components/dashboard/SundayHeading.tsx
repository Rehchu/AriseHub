"use client";

import { useEffect, useState } from "react";

/**
 * "Sunday, August 16" + "7 days out".
 *
 * Client component because "the coming Sunday" depends on the VIEWER's clock,
 * and the server (Cloudflare Workers) lives in UTC. First render uses UTC
 * arithmetic so hydration matches what the server produced; an effect then
 * re-computes in the browser's own timezone. The two can still disagree for
 * the seconds around midnight, hence suppressHydrationWarning.
 */
function comingSunday(utc: boolean): { label: string; daysOut: number } {
  const now = new Date();
  const day = utc ? now.getUTCDay() : now.getDay();
  const daysOut = (7 - day) % 7; // Sunday itself counts as 0 days out
  const target = new Date(now);
  if (utc) target.setUTCDate(now.getUTCDate() + daysOut);
  else target.setDate(now.getDate() + daysOut);
  const label = target.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });
  return { label, daysOut };
}

export function SundayHeading() {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  const { label, daysOut } = comingSunday(!local);

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1
        suppressHydrationWarning
        className="font-display text-2xl font-bold text-ink-900 sm:text-3xl"
      >
        {label}
      </h1>
      <p suppressHydrationWarning className="text-sm text-ink-500">
        {daysOut === 0 ? "Today" : daysOut === 1 ? "1 day out" : `${daysOut} days out`}
      </p>
    </div>
  );
}
