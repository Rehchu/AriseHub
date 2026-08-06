"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campus } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

export function CampusesAdmin({ initial }: { initial: Campus[] }) {
  const supabase = createClient();
  const [campuses, setCampuses] = useState<Campus[]>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("campuses")
      .insert({ name: clean })
      .select("*")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setCampuses((c) =>
      [...c, data as Campus].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setName("");
  }

  async function rename(id: string, current: string) {
    const next = window.prompt("Rename campus", current);
    if (!next || next.trim() === current) return;
    const { error } = await supabase
      .from("campuses")
      .update({ name: next.trim() })
      .eq("id", id);
    if (error) return setError(error.message);
    setCampuses((c) => c.map((x) => (x.id === id ? { ...x, name: next.trim() } : x)));
  }

  return (
    <div>
      <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
        Directory is visible church-wide across campuses. Operational data
        (check-in, rooms, services, medical) stays scoped to each person&apos;s
        campus.
      </p>

      <form onSubmit={add} className="mb-6 flex gap-2">
        <input
          className="ah-input"
          placeholder="New campus name (e.g. Pineville)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        {campuses.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
              <Icon name="home" />
            </span>
            <p className="flex-1 font-medium text-ink-900">{c.name}</p>
            <button
              onClick={() => rename(c.id, c.name)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
            >
              Rename
            </button>
          </div>
        ))}
        {campuses.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-400">
            No campuses yet — add your two campuses above.
          </p>
        )}
      </div>
    </div>
  );
}
