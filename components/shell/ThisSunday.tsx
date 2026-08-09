"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * The sidebar's "This Sunday" card (design handoff, shell spec): the next
 * service plan and how staffed it is, pinned where everyone sees it without
 * opening anything.
 *
 * Renders nothing while loading and nothing when there is no upcoming plan —
 * a card announcing "no service" would be noise on every screen. RLS decides
 * which plan "next" means for this person (0065): a Praise Team member sees
 * their team's next plan, leadership sees the church's.
 */
export function ThisSunday() {
  const [plan, setPlan] = useState<{
    id: string;
    title: string;
    service_date: string;
    accepted: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: plans } = await supabase
        .from("service_plans")
        .select("id, title, service_date")
        .gte("service_date", today)
        .order("service_date", { ascending: true })
        .limit(1);
      const next = (plans ?? [])[0] as
        | { id: string; title: string; service_date: string }
        | undefined;
      if (!next || cancelled) return;

      const { data: assigns } = await supabase
        .from("plan_assignments")
        .select("status")
        .eq("plan_id", next.id);
      if (cancelled) return;
      const rows = (assigns ?? []) as { status: string }[];
      setPlan({
        ...next,
        accepted: rows.filter((a) => a.status === "accepted").length,
        total: rows.length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!plan) return null;

  // The date arrives as a plain YYYY-MM-DD; new Date() on that parses UTC and
  // renders a day early in Chicago, so build it as local time explicitly.
  const [y, m, d] = plan.service_date.split("-").map(Number);
  const when = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const pct = plan.total > 0 ? Math.round((plan.accepted / plan.total) * 100) : 0;

  return (
    <div className="mx-3 mb-2 mt-4">
      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-chrome-300">
        This Sunday
      </p>
      <Link
        href={`/services/${plan.id}`}
        className="block rounded-lg border px-3 py-2.5 transition hover:brightness-110"
        style={{
          background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
          borderColor: "color-mix(in srgb, var(--color-accent) 25%, transparent)",
        }}
      >
        <p className="text-[13px] font-medium text-chrome-50">{when}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-chrome-200">{plan.title}</p>
        {plan.total > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-chrome-200">
            <span
              className="relative h-[3px] w-[52px] overflow-hidden rounded-full"
              style={{ background: "color-mix(in srgb, var(--color-accent) 25%, transparent)" }}
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent"
                style={{ width: `${pct}%` }}
              />
            </span>
            {plan.accepted} of {plan.total} confirmed
          </div>
        )}
      </Link>
    </div>
  );
}
