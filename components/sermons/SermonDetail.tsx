"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { formatClock, youtubeEmbedUrl, youtubeId } from "@/lib/youtube";

export interface Sermon {
  id: string;
  title: string;
  speaker_name: string | null;
  series_id: string | null;
  preached_on: string;
  scripture_refs: string[] | null;
  youtube_url: string | null;
  summary: string | null;
  published: boolean;
}

export interface Cue {
  idx: number;
  start_seconds: number | string;
  end_seconds: number | string | null;
  text: string;
}

export function SermonDetail({
  sermon,
  cues,
  seriesName,
  canManage,
}: {
  sermon: Sermon;
  cues: Cue[];
  seriesName: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | undefined>(undefined);

  // origin has to come from the browser: the embed only accepts commands from
  // the page that declared it.
  useEffect(() => setOrigin(window.location.origin), []);

  const videoId = youtubeId(sermon.youtube_url);

  // numeric() comes back from Postgres as a string.
  const rows = useMemo(
    () => cues.map((c) => ({ ...c, start: Number(c.start_seconds) })),
    [cues],
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.text.toLowerCase().includes(term));
  }, [rows, q]);

  /**
   * Jump the video to a moment in the transcript.
   *
   * Uses the iframe's postMessage command API rather than loading YouTube's
   * script — no third-party JS, and nothing to clean up.
   */
  function seek(seconds: number) {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
      "https://www.youtube.com",
    );
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "playVideo", args: [] }),
      "https://www.youtube.com",
    );
  }

  async function uploadTranscript(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const res = await fetch(`/api/sermons/${sermon.id}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename: file.name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setMessage(`Transcript saved — ${d.cues} lines.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished() {
    setBusy(true);
    const next = !sermon.published;
    const { error } = await supabase
      .from("sermons")
      .update({ published: next, published_at: next ? new Date().toISOString() : null })
      .eq("id", sermon.id);
    setBusy(false);
    if (error) setMessage(error.message);
    else router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 lg:p-6">
      <Link href="/sermons" className="text-sm text-ink-500 hover:text-ink-800">
        ← All sermons
      </Link>

      <div className="mt-2 mb-1 flex flex-wrap items-start justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">{sermon.title}</h1>
        {canManage && (
          <button
            onClick={togglePublished}
            disabled={busy}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              sermon.published
                ? "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                : "bg-accent text-onaccent hover:bg-accent-strong"
            }`}
          >
            {sermon.published ? "Unpublish" : "Publish"}
          </button>
        )}
      </div>
      <p className="text-sm text-ink-500">
        {[
          sermon.speaker_name,
          seriesName,
          new Date(`${sermon.preached_on}T00:00:00Z`).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {!sermon.published && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Draft — only staff can see this until it&apos;s published.
        </p>
      )}

      {sermon.scripture_refs && sermon.scripture_refs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sermon.scripture_refs.map((r) => (
            <Link
              key={r}
              href={`/bible?ref=${encodeURIComponent(r)}`}
              className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              {r}
            </Link>
          ))}
        </div>
      )}

      {sermon.summary && <p className="mt-3 text-sm text-ink-700">{sermon.summary}</p>}

      {videoId ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-ink-100 bg-black">
          <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              ref={iframeRef}
              src={youtubeEmbedUrl(videoId, origin)}
              title={sermon.title}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      ) : (
        sermon.youtube_url && (
          <p className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm text-ink-600">
            That video link isn&apos;t a YouTube URL we can embed —{" "}
            <a href={sermon.youtube_url} className="underline" target="_blank" rel="noreferrer">
              open it directly
            </a>
            .
          </p>
        )
      )}

      {canManage && (
        <div className="mt-4 rounded-xl border border-ink-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-ink-900">Transcript</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Upload the service captions (.vtt is best — it carries the timings, so every line
            can jump the video). Uploading again replaces what&apos;s there.
          </p>
          <input
            type="file"
            accept=".vtt,.srt,.txt,text/vtt,text/plain"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadTranscript(f);
              e.target.value = "";
            }}
            className="mt-2 block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-onaccent"
          />
          {message && <p className="mt-2 text-xs text-ink-600">{message}</p>}
        </div>
      )}

      {rows.length > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink-900">
              Transcript{" "}
              <span className="text-sm font-normal text-ink-400">({rows.length} lines)</span>
            </h2>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search this message…"
              aria-label="Search transcript"
              className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm sm:max-w-xs"
            />
          </div>
          {shown.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
              Nothing in this message matches “{q}”.
            </p>
          ) : (
            <ol className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
              {shown.map((c) => (
                <li key={c.idx}>
                  <button
                    onClick={() => seek(c.start)}
                    disabled={!videoId}
                    className="flex w-full gap-3 px-3 py-2 text-left transition hover:bg-ink-50 disabled:cursor-default disabled:hover:bg-transparent"
                    title={videoId ? "Jump the video here" : undefined}
                  >
                    <span className="shrink-0 pt-0.5 font-mono text-xs text-brand-500">
                      {formatClock(c.start)}
                    </span>
                    <span className="text-sm leading-relaxed text-ink-800">{c.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {rows.length === 0 && !canManage && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-400">
          <Icon name="chat" size={16} /> No transcript for this message yet.
        </p>
      )}
    </div>
  );
}
