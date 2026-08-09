"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatCell } from "./StatStrip";

/**
 * People currently checked in since LOCAL midnight — which is the browser's
 * midnight, so this has to be a client component: the server renders in UTC
 * and would draw the line up to a day off. Only really moves on Sundays, but
 * a zero on a Tuesday is a true zero, not a bug.
 *
 * RLS may hide check-ins from people without check-in access; a null count
 * renders as 0 rather than an error.
 */
export function CheckedInToday({ className = "" }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const supabase = createClient();
    supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("status", "checked_in")
      .gte("checked_in_at", midnight.toISOString())
      .then(({ count: n }) => {
        if (!cancelled) setCount(n ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StatCell
      className={className}
      href="/checkins"
      kicker="Checked in today"
      value={count === null ? "—" : String(count)}
      status="since midnight"
    />
  );
}
