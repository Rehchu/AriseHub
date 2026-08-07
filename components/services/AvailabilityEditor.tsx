"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { WEEKDAYS, type Blockout, type ServingPattern } from "@/lib/availability";

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"];

/**
 * Self-service availability. Two signals the scheduler reads:
 *   * blockouts — hard "I'm away these dates"
 *   * patterns  — soft "I normally serve these days/weeks"
 */
export function AvailabilityEditor({
  profileId,
  initialBlockouts,
  initialPatterns,
}: {
  profileId: string;
  initialBlockouts: Blockout[];
  initialPatterns: ServingPattern[];
}) {
  const supabase = createClient();
  const [blockouts, setBlockouts] = useState<Blockout[]>(initialBlockouts);
  const [patterns, setPatterns] = useState<ServingPattern[]>(initialPatterns);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addBlockout(e: React.FormEvent) {
    e.preventDefault();
    if (!from) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("blockout_dates")
      .insert({
        profile_id: profileId,
        starts_on: from,
        ends_on: to || from,
        reason: reason.trim() || null,
      })
      .select("id, profile_id, starts_on, ends_on, reason")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setBlockouts((b) =>
      [...b, data as Blockout].sort((x, y) => x.starts_on.localeCompare(y.starts_on)),
    );
    setFrom("");
    setTo("");
    setReason("");
  }

  async function removeBlockout(id: string) {
    setBlockouts((b) => b.filter((x) => x.id !== id));
    await supabase.from("blockout_dates").delete().eq("id", id);
  }

  // Toggling a weekday on/off, and which weeks of the month within it.
  async function toggleDay(weekday: number) {
    const existing = patterns.find((p) => p.weekday === weekday);
    if (existing) {
      setPatterns((p) => p.filter((x) => x.weekday !== weekday));
      await supabase.from("serving_patterns").delete().eq("id", existing.id);
    } else {
      const { data } = await supabase
        .from("serving_patterns")
        .insert({ profile_id: profileId, weekday, weeks: [] })
        .select("id, profile_id, weekday, weeks, note")
        .single();
      if (data) setPatterns((p) => [...p, data as ServingPattern]);
    }
  }

  async function toggleWeek(weekday: number, week: number) {
    const pat = patterns.find((p) => p.weekday === weekday);
    if (!pat) return;
    const weeks = pat.weeks.includes(week)
      ? pat.weeks.filter((w) => w !== week)
      : [...pat.weeks, week].sort();
    setPatterns((p) => p.map((x) => (x.id === pat.id ? { ...x, weeks } : x)));
    await supabase.from("serving_patterns").update({ weeks }).eq("id", pat.id);
  }

  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <a
        href="/services"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600"
      >
        ← Services
      </a>
      <h1 className="font-display text-2xl font-bold text-ink-900">My availability</h1>
      <p className="mt-1 text-ink-500">
        Tell schedulers when you can&apos;t serve, and when you normally do. They&apos;ll
        see this before assigning you.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      {/* ---- Recurring pattern ---- */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          When I normally serve
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Pick the days you usually serve. Leave weeks unselected for &ldquo;every
          week&rdquo;.
        </p>
        <div className="mt-3 space-y-2">
          {WEEKDAYS.map((day, i) => {
            const pat = patterns.find((p) => p.weekday === i);
            return (
              <div key={day} className="rounded-xl border border-ink-100 bg-white p-3">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={!!pat}
                    onChange={() => toggleDay(i)}
                    className="h-4 w-4"
                  />
                  <span className="font-medium text-ink-800">{day}</span>
                  {pat && (
                    <span className="text-xs text-ink-400">
                      {pat.weeks.length === 0
                        ? "every week"
                        : pat.weeks.map((w) => ORDINALS[w]).join(", ")}
                    </span>
                  )}
                </label>
                {pat && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {[1, 2, 3, 4, 5].map((w) => {
                      const on = pat.weeks.includes(w);
                      return (
                        <button
                          key={w}
                          onClick={() => toggleWeek(i, w)}
                          className={`rounded-full px-2.5 py-1 text-xs transition ${
                            on
                              ? "bg-brand-500 text-white"
                              : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                          }`}
                        >
                          {ORDINALS[w]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Blockouts ---- */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Dates I&apos;m unavailable
        </h2>
        <form
          onSubmit={addBlockout}
          className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-ink-100 bg-white p-3"
        >
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-500">From</span>
            <input
              type="date"
              className="ah-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-500">
              To (optional)
            </span>
            <input
              type="date"
              className="ah-input"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="min-w-40 flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-500">Reason</span>
            <input
              className="ah-input"
              placeholder="Vacation, work…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            Add
          </button>
        </form>

        <div className="mt-3 space-y-2">
          {blockouts.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Icon name="calendar" size={18} />
              </span>
              <div className="flex-1">
                <p className="font-medium text-ink-900">
                  {fmt(b.starts_on)}
                  {b.ends_on !== b.starts_on && ` – ${fmt(b.ends_on)}`}
                </p>
                {b.reason && <p className="text-xs text-ink-400">{b.reason}</p>}
              </div>
              <button
                onClick={() => removeBlockout(b.id)}
                className="text-ink-300 hover:text-brand-500"
                aria-label="Remove"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {blockouts.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400">
              No blockout dates — you&apos;re available unless you say otherwise.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
