"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface MyPlan {
  id: string;
  title: string;
  service_date: string;
  notes: string | null;
  team: {
    id: string;
    position: string;
    profile_id: string | null;
    status: "invited" | "accepted" | "declined";
    name: string | null;
    phone: string | null;
  }[];
}

const STATUS_STYLE: Record<string, string> = {
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-ink-100 text-ink-400",
  invited: "bg-amber-50 text-amber-700",
};

/**
 * A volunteer's own schedule.
 *
 * You only see plans you're actually on — but for those, you see the WHOLE
 * team. Knowing who else is serving (and whether they've accepted) is the point
 * of a rota; without it people can't swap, cover, or coordinate.
 */
export function MySchedule({
  plans,
  currentProfileId,
}: {
  plans: MyPlan[];
  currentProfileId: string;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState(plans);
  const [showPast, setShowPast] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const { upcoming, past } = useMemo(() => {
    const u: MyPlan[] = [];
    const p: MyPlan[] = [];
    for (const r of rows) (r.service_date >= today ? u : p).push(r);
    return { upcoming: u, past: p.reverse() };
  }, [rows, today]);

  const needsResponse = upcoming.filter((p) =>
    p.team.some((t) => t.profile_id === currentProfileId && t.status === "invited"),
  ).length;

  async function respond(planId: string, assignmentId: string, status: "accepted" | "declined") {
    setRows((rs) =>
      rs.map((p) =>
        p.id === planId
          ? { ...p, team: p.team.map((t) => (t.id === assignmentId ? { ...t, status } : t)) }
          : p,
      ),
    );
    await supabase.from("plan_assignments").update({ status }).eq("id", assignmentId);
  }

  function PlanCard({ p }: { p: MyPlan }) {
    const me = p.team.filter((t) => t.profile_id === currentProfileId);
    const others = p.team.filter((t) => t.profile_id !== currentProfileId);
    const d = new Date(p.service_date + "T00:00:00");

    return (
      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-pink-50 text-pink-600">
            <span className="text-[10px] uppercase leading-none">
              {d.toLocaleDateString(undefined, { month: "short" })}
            </span>
            <span className="text-lg font-bold leading-none">{d.getDate()}</span>
          </span>
          <div className="min-w-0 flex-1">
            <Link href={`/services/${p.id}`} className="font-display font-semibold text-ink-900 hover:text-brand-600">
              {p.title}
            </Link>
            <p className="text-xs text-ink-400">
              {d.toLocaleDateString(undefined, { weekday: "long" })}
            </p>
          </div>
        </div>

        {/* What I'm doing */}
        <div className="mt-3 space-y-2">
          {me.map((t) => (
            <div key={t.id} className="rounded-lg bg-brand-50 p-2.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink-900">You&apos;re on {t.position}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[t.status]}`}>
                  {t.status === "invited" ? "Needs response" : t.status}
                </span>
              </div>
              {t.status === "invited" && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => respond(p.id, t.id, "accepted")}
                    className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond(p.id, t.id, "declined")}
                    className="flex-1 rounded-lg bg-white py-1.5 text-sm font-medium text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
                  >
                    Can&apos;t make it
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Who else is serving */}
        {others.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Serving with you
            </p>
            <div className="space-y-1">
              {others.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      t.status === "accepted"
                        ? "bg-emerald-500"
                        : t.status === "declined"
                          ? "bg-ink-300"
                          : "bg-amber-500"
                    }`}
                    title={t.status}
                  />
                  <span className="font-medium text-ink-700">{t.position}</span>
                  <span className="truncate text-ink-500">{t.name ?? "unassigned"}</span>
                  {t.phone && (
                    <a href={`tel:${t.phone}`} className="ml-auto shrink-0 text-xs text-brand-600 underline">
                      Call
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/services" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← Services
      </Link>

      <h1 className="font-display text-2xl font-bold text-ink-900">My schedule</h1>
      <p className="mt-1 text-ink-500">
        {upcoming.length === 0
          ? "You're not scheduled for anything upcoming."
          : `${upcoming.length} upcoming${needsResponse > 0 ? ` · ${needsResponse} needs a response` : ""}`}
      </p>

      <div className="mt-6 space-y-3">
        {upcoming.map((p) => (
          <PlanCard key={p.id} p={p} />
        ))}
        {upcoming.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
            Nothing coming up. Set your availability so schedulers know when you can serve.
          </p>
        )}
      </div>

      {past.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowPast((s) => !s)}
            className="text-sm font-medium text-ink-500 hover:text-brand-600"
          >
            {showPast ? "Hide" : "Show"} past ({past.length})
          </button>
          {showPast && (
            <div className="mt-3 space-y-3 opacity-70">
              {past.map((p) => (
                <PlanCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href="/services/availability"
          className="flex items-center gap-2 rounded-lg bg-ink-100 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-200"
        >
          <Icon name="calendar" size={16} /> My availability
        </Link>
      </div>
    </div>
  );
}
