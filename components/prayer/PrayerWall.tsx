"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface PrayerRequest {
  id: string;
  person_id: string | null;
  submitted_name: string | null;
  contact: string | null;
  body: string;
  visibility: "public" | "prayer_team_only";
  status: "open" | "praying" | "answered" | "archived";
  created_at: string;
  person?: { full_name: string } | null;
}

const STATUS_STYLE: Record<PrayerRequest["status"], string> = {
  open: "bg-ink-100 text-ink-600",
  praying: "bg-blue-100 text-blue-800",
  answered: "bg-emerald-100 text-emerald-800",
  archived: "bg-ink-100 text-ink-400",
};

export function PrayerWall({
  rows,
  isPrayerTeam,
  currentProfileId,
}: {
  rows: PrayerRequest[];
  isPrayerTeam: boolean;
  currentProfileId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const open = useMemo(
    () => rows.filter((r) => r.status === "open" || r.status === "praying"),
    [rows],
  );
  const answered = useMemo(() => rows.filter((r) => r.status === "answered"), [rows]);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const anonymous = form.get("anonymous") === "on";
    const { error: err } = await supabase.from("prayer_requests").insert({
      // Anonymous means the prayer team sees the request without the name
      // attached — not that it is untraceable, which would make follow-up
      // impossible and pastoral care worse.
      person_id: anonymous ? null : currentProfileId,
      submitted_name: anonymous ? null : String(form.get("name") ?? "").trim() || null,
      contact: String(form.get("contact") ?? "").trim() || null,
      body: String(form.get("body") ?? "").trim(),
      visibility:
        form.get("share") === "on" ? "public" : "prayer_team_only",
    });
    setBusy(false);
    if (err) return setError(err.message);
    setSent(true);
    router.refresh();
  }

  async function setStatus(id: string, status: PrayerRequest["status"]) {
    setBusy(true);
    const { error: err } = await supabase
      .from("prayer_requests")
      .update({ status })
      .eq("id", id);
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }

  const card = (r: PrayerRequest) => (
    <li key={r.id} className="rounded-xl border border-ink-100 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink-800">
          {r.person?.full_name ?? r.submitted_name ?? "Anonymous"}
        </span>
        <span className="flex items-center gap-1.5">
          {r.visibility === "prayer_team_only" && (
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              Prayer team only
            </span>
          )}
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[r.status]}`}
          >
            {r.status}
          </span>
        </span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-700">{r.body}</p>
      {isPrayerTeam && r.contact && (
        <p className="mt-1 text-xs text-ink-400">Contact: {r.contact}</p>
      )}
      {isPrayerTeam && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.status !== "praying" && (
            <button
              onClick={() => setStatus(r.id, "praying")}
              disabled={busy}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 disabled:opacity-50"
            >
              Praying
            </button>
          )}
          {r.status !== "answered" && (
            <button
              onClick={() => setStatus(r.id, "answered")}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent disabled:opacity-50"
            >
              Answered
            </button>
          )}
          <button
            onClick={() => setStatus(r.id, "archived")}
            disabled={busy}
            className="ml-auto text-xs font-medium text-ink-400 hover:text-ink-700"
          >
            Archive
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Prayer</h1>
      <p className="mb-4 text-sm text-ink-500">
        {isPrayerTeam
          ? "Requests routed to the prayer team."
          : "Ask the prayer team to pray with you. Only they see it unless you choose to share it."}
      </p>

      {sent ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Sent — the prayer team has it.{" "}
          <button onClick={() => setSent(false)} className="underline">
            Send another
          </button>
        </div>
      ) : (
        <form action={submit} className="mb-6 rounded-xl border border-ink-100 bg-white p-4">
          <label className="block text-sm text-ink-700">
            What can we pray for?
            <textarea
              name="body"
              required
              rows={3}
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink-700">
              Your name <span className="text-ink-400">(optional)</span>
              <input
                name="name"
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-ink-700">
              Phone or email <span className="text-ink-400">(optional)</span>
              <input
                name="contact"
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-ink-700">
            <input type="checkbox" name="anonymous" className="mt-1" />
            <span>
              Send anonymously
              <span className="block text-xs text-ink-500">
                Your name won&apos;t be attached to the request.
              </span>
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm text-ink-700">
            <input type="checkbox" name="share" className="mt-1" />
            <span>
              Share this with the church
              <span className="block text-xs text-ink-500">
                Off by default — only the prayer team sees it.
              </span>
            </span>
          </label>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to the prayer team"}
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
          {isPrayerTeam ? `Open (${open.length})` : "Shared with the church"}
        </h2>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
            Nothing here right now.
          </p>
        ) : (
          <ul className="space-y-2">{open.map(card)}</ul>
        )}
      </section>

      {answered.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Answered
          </h2>
          <ul className="space-y-2">{answered.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
