"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface PlanRow {
  id: string;
  title: string;
  service_date: string;
  myStatus: string | null;
}

/** "2026-08-16" → { kicker: "AUG 16", weekday: "Sunday" }. */
function dateBits(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return {
    kicker: d
      .toLocaleDateString(undefined, { month: "short", day: "numeric" })
      .toUpperCase(),
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
  };
}

/** Your own standing on a plan. Brand tint = it is waiting on you. */
function StatusTag({ status }: { status: string }) {
  if (status === "accepted")
    return (
      <span className="inline-block rounded bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
        Confirmed
      </span>
    );
  if (status === "declined")
    return (
      <span className="inline-block rounded border border-ink-200 px-2 py-0.5 text-[11px] text-ink-500">
        Declined
      </span>
    );
  return (
    <span className="inline-block rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
      Needs response
    </span>
  );
}

export function PlansList({
  initial,
  canManage,
  currentProfileId,
  departments = [],
}: {
  initial: PlanRow[];
  canManage: boolean;
  currentProfileId: string;
  departments?: { id: string; name: string }[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [plans] = useState<PlanRow[]>(initial);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [deptId, setDeptId] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setCreateError(null);
    const { data, error } = await supabase
      .from("service_plans")
      .insert({
        title: title.trim(),
        service_date: date || undefined,
        department_id: deptId || null,
        created_by: currentProfileId,
      })
      .select("id")
      .single();
    if (!error && data) {
      router.push(`/services/${(data as { id: string }).id}`);
      return;
    }
    setCreateError(error?.message ?? "Couldn't create the plan — try again.");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header: title + context, section links and the primary action on the same row. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink-100 pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold text-ink-900">Services</h1>
          <p className="text-sm text-ink-500">
            {canManage ? "plans & volunteer scheduling" : "your serving schedule"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <a
            href="/services/my"
            className="text-sm font-medium text-ink-500 transition hover:text-brand-600"
          >
            My schedule
          </a>
          <a
            href="/services/songs"
            className="text-sm font-medium text-ink-500 transition hover:text-brand-600"
          >
            Songs
          </a>
          <a
            href="/services/schedule"
            className="text-sm font-medium text-ink-500 transition hover:text-brand-600"
          >
            Schedule calendar
          </a>
          <a
            href="/services/availability"
            className="text-sm font-medium text-ink-500 transition hover:text-brand-600"
          >
            My availability
          </a>
          {canManage && (
            <button
              onClick={() => setCreating((c) => !c)}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
            >
              <Icon name="music" size={18} /> New plan
            </button>
          )}
        </div>
      </div>

      {creating && canManage && (
        <form onSubmit={create} className="mb-6 flex flex-wrap gap-2 rounded-xl border border-ink-100 bg-white p-4">
          <input className="ah-input flex-1" placeholder="Plan title (e.g. Sunday AM)" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input type="date" className="ah-input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          {departments.length > 0 && (
            <select className="ah-input w-auto" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60">
            Create
          </button>
          {createError && (
            <p className="w-full rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
              {createError}
            </p>
          )}
        </form>
      )}

      {plans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
          {canManage ? "No plans yet — create your first service plan." : "You're not scheduled on any plans yet."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100">
                <th className="w-28 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Date
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Service
                </th>
                <th className="w-36 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {plans.map((p) => {
                const d = dateBits(p.service_date);
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/services/${p.id}`)}
                    className="cursor-pointer transition hover:bg-ink-50"
                  >
                    <td className="px-3 py-2 align-top">
                      <p className="whitespace-nowrap text-xs font-semibold tracking-wide text-ink-600">
                        {d.kicker}
                      </p>
                      <p className="text-[11px] text-ink-400">{d.weekday}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/services/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-ink-900 hover:text-brand-600"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.myStatus ? (
                        <StatusTag status={p.myStatus} />
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
