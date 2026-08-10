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

/** Status dot for the rest of the team. Brand = confirmed, ink-400 = pending, hairline = declined. */
const DOT_STYLE: Record<string, string> = {
  accepted: "bg-brand-600",
  declined: "bg-ink-200",
  invited: "bg-ink-400",
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
  const [failedResponseId, setFailedResponseId] = useState<string | null>(null);

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
    const previous = rows
      .find((p) => p.id === planId)
      ?.team.find((t) => t.id === assignmentId)?.status;
    setFailedResponseId(null);
    setRows((rs) =>
      rs.map((p) =>
        p.id === planId
          ? { ...p, team: p.team.map((t) => (t.id === assignmentId ? { ...t, status } : t)) }
          : p,
      ),
    );
    // `.select` makes the write authoritative — an RLS refusal returns zero rows
    // with a null error, which an unchecked update reads as success. On failure,
    // put the invitation back so the volunteer isn't shown a response that never
    // saved.
    const { data, error } = await supabase
      .from("plan_assignments")
      .update({ status })
      .eq("id", assignmentId)
      .select("id");
    if (error || !data?.length) {
      setRows((rs) =>
        rs.map((p) =>
          p.id === planId
            ? {
                ...p,
                team: p.team.map((t) =>
                  t.id === assignmentId && previous ? { ...t, status: previous } : t,
                ),
              }
            : p,
        ),
      );
      setFailedResponseId(assignmentId);
    }
  }

  function PlanCard({ p }: { p: MyPlan }) {
    const me = p.team.filter((t) => t.profile_id === currentProfileId);
    const others = p.team.filter((t) => t.profile_id !== currentProfileId);
    const d = new Date(p.service_date + "T00:00:00");
    const dateLine = `${d.toLocaleDateString(undefined, { weekday: "long" })} · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`.toUpperCase();

    return (
      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        <div className="border-b border-ink-100 px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{dateLine}</p>
          <Link
            href={`/services/${p.id}`}
            className="font-display font-semibold text-ink-900 hover:text-brand-600"
          >
            {p.title}
          </Link>
        </div>

        <div className="px-4 py-3">
          {/* What I'm doing */}
          {me.length > 0 && (
            <div className="space-y-2">
              {me.map((t) => (
                <div key={t.id} className="rounded-lg bg-brand-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">
                      You&apos;re on {t.position}
                    </span>
                    <span
                      className={`ml-auto text-[11px] font-semibold ${
                        t.status === "invited"
                          ? "text-brand-700"
                          : t.status === "accepted"
                            ? "text-ink-600"
                            : "text-ink-500"
                      }`}
                    >
                      {t.status === "invited"
                        ? "Needs response"
                        : t.status === "accepted"
                          ? "Confirmed"
                          : "Declined"}
                    </span>
                  </div>
                  {t.status === "invited" && (
                    <>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => respond(p.id, t.id, "accepted")}
                          className="flex-1 rounded-lg bg-accent py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
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
                      {failedResponseId === t.id && (
                        <p className="mt-2 text-xs font-medium text-brand-700">
                          Couldn&apos;t save your response — try again.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Who else is serving */}
          {others.length > 0 && (
            <div className={me.length > 0 ? "mt-3" : ""}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                Serving with you
              </p>
              <div className="space-y-1">
                {others.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLE[t.status]}`}
                      title={t.status}
                    />
                    <span className="font-medium text-ink-700">{t.position}</span>
                    <span className="truncate text-ink-500">{t.name ?? "unassigned"}</span>
                    {t.phone && (
                      <a
                        href={`tel:${t.phone}`}
                        className="ml-auto shrink-0 text-xs font-medium text-brand-600 underline"
                      >
                        Call
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/services" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← Services
      </Link>

      {/* Header: title with the state of your rota beside it. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ink-100 pb-4">
        <h1 className="font-display text-2xl font-bold text-ink-900">My schedule</h1>
        <p className="text-sm text-ink-500">
          {upcoming.length === 0
            ? "nothing upcoming"
            : `${upcoming.length} upcoming${
                needsResponse > 0 ? ` · ${needsResponse} needs a response` : ""
              }`}
        </p>
      </div>

      <div className="mt-5 space-y-3">
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
