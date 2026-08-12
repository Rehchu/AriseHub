"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface SermonRow {
  id: string;
  plan_id: string | null;
  title: string;
  speaker_name: string | null;
  speaker_id: string | null;
  series_id: string | null;
  preached_on: string;
  scripture_refs: string[] | null;
  youtube_url: string | null;
  summary: string | null;
  published: boolean;
}

export interface SeriesRow {
  id: string;
  name: string;
}

/** A service plan that has happened but isn't archived yet. */
export interface PlanOption {
  id: string;
  title: string;
  service_date: string;
  campus_id: string | null;
}

/** "2026-08-09" → "Sun, Aug 9 2026". Date-only, so UTC keeps it exact. */
function dateLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SermonArchive({
  rows,
  series,
  plans,
  canManage,
}: {
  rows: SermonRow[];
  series: SeriesRow[];
  plans: PlanOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [manual, setManual] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seriesName = useMemo(
    () => Object.fromEntries(series.map((s) => [s.id, s.name])),
    [series],
  );

  // Filtering is client-side because the whole archive is a few hundred rows at
  // most — a church preaches ~50 times a year. Postgres full-text search is
  // there for when that stops being true.
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (seriesFilter && r.series_id !== seriesFilter) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        (r.speaker_name ?? "").toLowerCase().includes(term) ||
        (r.summary ?? "").toLowerCase().includes(term) ||
        (r.scripture_refs ?? []).some((s) => s.toLowerCase().includes(term)) ||
        (r.series_id ? (seriesName[r.series_id] ?? "").toLowerCase().includes(term) : false)
      );
    });
  }, [rows, q, seriesFilter, seriesName]);

  /**
   * Archive a service straight from its plan.
   *
   * The plan already knows the title, date and campus, so none of that is
   * retyped — this creates the draft and drops you on it to add the video and
   * transcript, which is the only part a plan can't tell us.
   */
  async function archivePlan(plan: PlanOption) {
    setBusyId(plan.id);
    setError(null);
    const { data, error: err } = await supabase
      .from("sermons")
      .insert({
        plan_id: plan.id,
        title: plan.title,
        preached_on: plan.service_date,
        campus_id: plan.campus_id,
      })
      .select("id")
      .single();
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    router.push(`/services/archive/${(data as { id: string }).id}`);
  }

  async function addManual(form: FormData) {
    setBusyId("manual");
    setError(null);
    const refs = String(form.get("scripture") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const { data, error: err } = await supabase
      .from("sermons")
      .insert({
        title: String(form.get("title") ?? "").trim(),
        speaker_name: String(form.get("speaker") ?? "").trim() || null,
        preached_on: String(form.get("date") ?? "") || new Date().toISOString().slice(0, 10),
        series_id: String(form.get("series") ?? "") || null,
        scripture_refs: refs,
      })
      .select("id")
      .single();
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setManual(false);
    router.push(`/services/archive/${(data as { id: string }).id}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      {/* Same header idiom as the rest of Services: title, context, section
          links on one row. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink-100 pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold text-ink-900">Archive</h1>
          <p className="text-sm text-ink-500">past services</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <a href="/services" className="text-sm font-medium text-ink-500 transition hover:text-brand-600">
            Plans
          </a>
          <a href="/services/songs" className="text-sm font-medium text-ink-500 transition hover:text-brand-600">
            Songs
          </a>
          <a href="/services/schedule" className="text-sm font-medium text-ink-500 transition hover:text-brand-600">
            Schedule calendar
          </a>
        </div>
      </div>

      {canManage && plans.length > 0 && (
        <section className="mb-6 rounded-xl border border-ink-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-ink-900">Services not archived yet</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Archiving carries the title, date and campus over from the plan — you only add the
            video and transcript.
          </p>
          <ul className="mt-3 divide-y divide-ink-100">
            {plans.slice(0, 8).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-800">{p.title}</span>
                  <span className="block text-xs text-ink-400">{dateLabel(p.service_date)}</span>
                </span>
                <button
                  onClick={() => archivePlan(p)}
                  disabled={busyId === p.id}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent transition hover:bg-accent-strong disabled:opacity-50"
                >
                  {busyId === p.id ? "Archiving…" : "Archive"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && (
        <div className="mb-4">
          <button
            onClick={() => setManual((m) => !m)}
            className="text-sm font-medium text-ink-500 transition hover:text-brand-600"
          >
            {manual ? "Cancel" : "+ Archive a message with no plan (older services)"}
          </button>
        </div>
      )}

      {canManage && manual && (
        <form
          action={addManual}
          className="mb-6 grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2"
        >
          <label className="text-sm text-ink-700 sm:col-span-2">
            Title
            <input
              name="title"
              required
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              placeholder="The God Who Sees"
            />
          </label>
          <label className="text-sm text-ink-700">
            Speaker
            <input name="speaker" className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-ink-700">
            Date preached
            <input
              type="date"
              name="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-ink-700">
            Series
            <select name="series" className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm">
              <option value="">None</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-700">
            Scripture <span className="text-ink-400">(comma separated)</span>
            <input
              name="scripture"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              placeholder="John 3:16, Romans 8"
            />
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busyId === "manual"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent disabled:opacity-50"
            >
              {busyId === "manual" ? "Saving…" : "Create draft"}
            </button>
          </div>
        </form>
      )}

      {error && !manual && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search past services…"
          aria-label="Search the archive"
          className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
        />
        {series.length > 0 && (
          <select
            value={seriesFilter}
            onChange={(e) => setSeriesFilter(e.target.value)}
            aria-label="Filter by series"
            className="min-w-0 max-w-[50%] rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">All series</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
          {rows.length === 0
            ? "Nothing archived yet — archive a past service above to start."
            : "Nothing matches that search."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link
                href={`/services/archive/${s.id}`}
                className="block rounded-xl border border-ink-100 bg-white p-4 transition hover:border-ink-200"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-ink-900">{s.title}</h2>
                  <span className="text-xs text-ink-400">{dateLabel(s.preached_on)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-500">
                  {[s.speaker_name, s.series_id ? seriesName[s.series_id] : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {s.scripture_refs && s.scripture_refs.length > 0 && (
                  <p className="mt-1 text-xs text-ink-400">{s.scripture_refs.join(" · ")}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!s.published && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Draft
                    </span>
                  )}
                  {s.youtube_url && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                      Video
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
