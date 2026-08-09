"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  ccli_number: string | null;
  default_key: string | null;
  bpm: number | null;
  themes: string[];
  notes: string | null;
  chart_url: string | null;
  elvanto_id: string | null;
  archived: boolean;
}

const KEYS = ["A", "A#", "Bb", "B", "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab"];

/**
 * The song library. Songs sync in from Elvanto when it's connected, and can be
 * added by hand so the Praise Team isn't blocked waiting on that.
 */
export function SongLibrary({
  initial,
  canManage,
  currentProfileId,
}: {
  initial: Song[];
  canManage: boolean;
  currentProfileId: string;
}) {
  const supabase = createClient();
  const [songs, setSongs] = useState<Song[]>(initial);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [key, setKey] = useState("");
  const [bpm, setBpm] = useState("");
  const [chartUrl, setChartUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(t) ||
        (s.artist ?? "").toLowerCase().includes(t) ||
        s.themes.some((th) => th.toLowerCase().includes(t)),
    );
  }, [songs, q]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("songs")
      .insert({
        title: title.trim(),
        artist: artist.trim() || null,
        default_key: key || null,
        bpm: bpm ? Number(bpm) : null,
        chart_url: chartUrl.trim() || null,
        created_by: currentProfileId,
      })
      .select("id, title, artist, ccli_number, default_key, bpm, themes, notes, chart_url, elvanto_id, archived")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setSongs((s) => [...s, data as Song].sort((a, b) => a.title.localeCompare(b.title)));
    setTitle("");
    setArtist("");
    setKey("");
    setBpm("");
    setChartUrl("");
    setAdding(false);
  }

  async function archive(s: Song) {
    if (!window.confirm(`Remove "${s.title}" from the library?`)) return;
    setSongs((list) => list.filter((x) => x.id !== s.id));
    await supabase.from("songs").update({ archived: true }).eq("id", s.id);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/services" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← Services
      </Link>

      {/* Header: title + count, the add action on the same row. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink-100 pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold text-ink-900">Songs</h1>
          <p className="text-sm text-ink-500">
            {songs.length} song{songs.length === 1 ? "" : "s"} · used when building service plans
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setAdding((a) => !a)}
            className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
          >
            <Icon name="music" size={18} /> Add song
          </button>
        )}
      </div>

      {adding && canManage && (
        <form onSubmit={add} className="mb-4 space-y-3 rounded-xl border border-ink-100 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="ah-input" placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <input className="ah-input" placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
            <select className="ah-input" value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Default key</option>
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input type="number" className="ah-input" placeholder="BPM" value={bpm} onChange={(e) => setBpm(e.target.value)} />
          </div>
          <input className="ah-input" placeholder="Chart / lyrics link (optional)" value={chartUrl} onChange={(e) => setChartUrl(e.target.value)} />
          {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60">
            {busy ? "Adding…" : "Add to library"}
          </button>
        </form>
      )}

      <input
        className="ah-input mb-3 max-w-sm"
        placeholder="Search title, artist or theme…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-400">
            {songs.length === 0
              ? "No songs yet — add one, or sync from Elvanto once it's connected."
              : "No songs match that search."}
          </p>
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100">
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Song
                </th>
                <th className="w-14 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Key
                </th>
                <th className="hidden w-16 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400 md:table-cell">
                  BPM
                </th>
                <th className="hidden w-24 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400 md:table-cell">
                  CCLI
                </th>
                <th className={`px-3 py-2 ${canManage ? "w-32" : "w-24"}`}>
                  <span className="sr-only">Links & actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2">
                    <p className="truncate font-medium text-ink-900">{s.title}</p>
                    {s.artist && <p className="truncate text-xs text-ink-400">{s.artist}</p>}
                    {(s.bpm || s.ccli_number) && (
                      <p className="truncate text-xs text-ink-400 md:hidden">
                        {[s.bpm && `${s.bpm} BPM`, s.ccli_number && `CCLI ${s.ccli_number}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {s.default_key ? (
                      <span className="inline-block rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-600">
                        {s.default_key}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 align-top text-[13px] text-ink-500 md:table-cell">
                    {s.bpm ?? <span className="text-ink-400">—</span>}
                  </td>
                  <td className="hidden truncate px-3 py-2 align-top text-[13px] text-ink-500 md:table-cell">
                    {s.ccli_number ?? <span className="text-ink-400">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-end gap-2.5">
                      {s.elvanto_id && (
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-600">
                          Elvanto
                        </span>
                      )}
                      {s.chart_url && (
                        <a
                          href={s.chart_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-medium text-brand-600 underline"
                        >
                          Chart
                        </a>
                      )}
                      {canManage && (
                        <button onClick={() => archive(s)} className="text-ink-400 hover:text-brand-600" aria-label="Remove">
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
