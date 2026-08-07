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

const STATUS_STYLE: Record<string, string> = {
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-ink-100 text-ink-400",
  invited: "bg-amber-50 text-amber-700",
};

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
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
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold text-ink-900">Services</h1>
          <p className="mt-1 text-ink-500">
            {canManage ? "Service plans & volunteer scheduling." : "Your serving schedule."}
          </p>
        </div>
        <a
          href="/services/schedule"
          className="rounded-lg bg-ink-100 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-200"
        >
          Schedule calendar
        </a>
        <a
          href="/services/availability"
          className="rounded-lg bg-ink-100 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-200"
        >
          My availability
        </a>
        {canManage && (
          <button
            onClick={() => setCreating((c) => !c)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Icon name="music" size={18} /> New plan
          </button>
        )}
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
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            Create
          </button>
        </form>
      )}

      <div className="space-y-2">
        {plans.map((p) => (
          <Link key={p.id} href={`/services/${p.id}`} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-4 transition hover:shadow-md">
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-pink-50 text-pink-600">
              <span className="text-[10px] uppercase leading-none">
                {new Date(p.service_date + "T00:00:00").toLocaleDateString(undefined, { month: "short" })}
              </span>
              <span className="text-lg font-bold leading-none">
                {new Date(p.service_date + "T00:00:00").getDate()}
              </span>
            </span>
            <div className="flex-1">
              <p className="font-display font-semibold text-ink-900">{p.title}</p>
              <p className="text-xs text-ink-400">
                {new Date(p.service_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" })}
              </p>
            </div>
            {p.myStatus && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[p.myStatus]}`}>
                {p.myStatus === "invited" ? "Needs response" : p.myStatus}
              </span>
            )}
          </Link>
        ))}
        {plans.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
            {canManage ? "No plans yet — create your first service plan." : "You're not scheduled on any plans yet."}
          </p>
        )}
      </div>
    </div>
  );
}
