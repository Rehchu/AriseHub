"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface Grant {
  profile_id: string;
  granted_at: string;
  note: string | null;
  full_name: string;
  email: string | null;
}

export function CareAccessAdmin({
  grants,
  people,
  alwaysAllowed,
}: {
  grants: Grant[];
  people: { id: string; full_name: string; email: string | null; role: string }[];
  alwaysAllowed: { id: string; full_name: string }[];
}) {
  const supabase = createClient();
  const [list, setList] = useState<Grant[]>(grants);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const superIds = new Set(alwaysAllowed.map((s) => s.id));
  const grantedIds = new Set(list.map((g) => g.profile_id));
  const candidates = people.filter((p) => !superIds.has(p.id) && !grantedIds.has(p.id));

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!pick) return;
    setBusy(true);
    setError(null);
    const person = people.find((p) => p.id === pick);
    const { data, error } = await supabase
      .from("care_access")
      .insert({ profile_id: pick, note: note.trim() || null })
      .select("profile_id, granted_at, note")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setList((l) => [
      ...l,
      {
        ...(data as { profile_id: string; granted_at: string; note: string | null }),
        full_name: person?.full_name ?? "Someone",
        email: person?.email ?? null,
      },
    ]);
    setPick("");
    setNote("");
  }

  async function revoke(g: Grant) {
    if (!window.confirm(`Remove ${g.full_name}'s access to Pastoral Care?`)) return;
    setList((l) => l.filter((x) => x.profile_id !== g.profile_id));
    await supabase.from("care_access").delete().eq("profile_id", g.profile_id);
  }

  return (
    <div>
      <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
        <strong>Pastoral Care is the most sensitive area of AriseHub.</strong> Only
        the Apostle and Pastor can see it by default, and only they can grant
        access to anyone else. Being Staff, IT, or a department lead grants
        nothing.
      </p>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        Always have access
      </h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-ink-100 bg-white">
        {alwaysAllowed.map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
              <Icon name="heart" size={18} />
            </span>
            <span className="flex-1 font-medium text-ink-900">{s.full_name}</span>
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
              Super Admin
            </span>
          </div>
        ))}
        {alwaysAllowed.length === 0 && (
          <p className="px-4 py-4 text-sm text-ink-400">No Super Admins yet.</p>
        )}
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Granted access
      </h2>
      <form onSubmit={grant} className="mt-2 flex flex-wrap gap-2 rounded-xl border border-ink-100 bg-ink-50 p-3">
        <select className="ah-input flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a person…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} — {p.role.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          className="ah-input flex-1"
          placeholder="Why (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !pick}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          Grant access
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 bg-white">
        {list.map((g) => (
          <div key={g.profile_id} className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{g.full_name}</p>
              <p className="text-xs text-ink-400">
                {g.email}
                {g.note && ` · ${g.note}`}
                {` · since ${new Date(g.granted_at).toLocaleDateString()}`}
              </p>
            </div>
            <button
              onClick={() => revoke(g)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              Revoke
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-400">
            Nobody else has been granted access.
          </p>
        )}
      </div>
    </div>
  );
}
