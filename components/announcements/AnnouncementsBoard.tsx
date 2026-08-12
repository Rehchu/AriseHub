"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  show_in_app: boolean;
  submitted_by: string | null;
  created_at: string;
  submitter?: { full_name: string } | null;
}

const STATUS_STYLE: Record<Announcement["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-ink-100 text-ink-500",
};

function dateLabel(iso: string | null) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function AnnouncementsBoard({
  rows,
  canApprove,
  currentProfileId,
}: {
  rows: Announcement[];
  canApprove: boolean;
  currentProfileId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const live = useMemo(() => rows.filter((r) => r.status === "approved"), [rows]);
  const mine = useMemo(
    () => rows.filter((r) => r.submitted_by === currentProfileId && r.status === "rejected"),
    [rows, currentProfileId],
  );

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("announcements").insert({
      submitted_by: currentProfileId,
      title: String(form.get("title") ?? "").trim(),
      body: String(form.get("body") ?? "").trim() || null,
      starts_on: String(form.get("starts") ?? "") || null,
      ends_on: String(form.get("ends") ?? "") || null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setAdding(false);
    router.refresh();
  }

  async function review(id: string, status: "approved" | "rejected", note?: string) {
    setBusy(true);
    const { error: err } = await supabase
      .from("announcements")
      .update({
        status,
        review_note: note ?? null,
        reviewed_by: currentProfileId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }

  const card = (a: Announcement, actions = false) => (
    <li key={a.id} className="rounded-xl border border-ink-100 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink-900">{a.title}</h3>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[a.status]}`}
        >
          {a.status}
        </span>
      </div>
      {(a.starts_on || a.ends_on) && (
        <p className="mt-0.5 text-xs text-ink-400">
          Runs {dateLabel(a.starts_on) ?? "—"}
          {a.ends_on ? ` – ${dateLabel(a.ends_on)}` : ""}
        </p>
      )}
      {a.body && <p className="mt-1.5 text-sm text-ink-700">{a.body}</p>}
      {a.submitter?.full_name && (
        <p className="mt-1 text-xs text-ink-400">Asked by {a.submitter.full_name}</p>
      )}
      {a.review_note && (
        <p className="mt-1.5 rounded bg-ink-50 px-2 py-1 text-xs text-ink-600">{a.review_note}</p>
      )}
      {actions && canApprove && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => review(a.id, "approved")}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => {
              const note = window.prompt("Why not? (optional — the submitter sees this)");
              if (note !== null) void review(a.id, "rejected", note || undefined);
            }}
            disabled={busy}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-700 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">Announcements</h1>
        <button
          onClick={() => setAdding((a) => !a)}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
        >
          {adding ? "Cancel" : "Ask for one"}
        </button>
      </div>
      <p className="mb-4 text-sm text-ink-500">
        Ask for something to be announced. Approved ones show here and go on the Media list for
        the weekend slides.
      </p>

      {adding && (
        <form
          action={submit}
          className="mb-6 grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2"
        >
          <label className="text-sm text-ink-700 sm:col-span-2">
            What should we announce?
            <input
              name="title"
              required
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              placeholder="Youth car wash"
            />
          </label>
          <label className="text-sm text-ink-700 sm:col-span-2">
            Details
            <textarea
              name="body"
              rows={2}
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              placeholder="Saturday 9am in the north lot — bring buckets."
            />
          </label>
          <label className="text-sm text-ink-700">
            First date
            <input
              type="date"
              name="starts"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-ink-700">
            Last date
            <input
              type="date"
              name="ends"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send for approval"}
            </button>
          </div>
        </form>
      )}

      {canApprove && pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Waiting on you ({pending.length})
          </h2>
          <ul className="space-y-2">{pending.map((a) => card(a, true))}</ul>
        </section>
      )}

      {!canApprove && pending.some((p) => p.submitted_by === currentProfileId) && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Yours, waiting for approval
          </h2>
          <ul className="space-y-2">
            {pending.filter((p) => p.submitted_by === currentProfileId).map((a) => card(a))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
          Announced
        </h2>
        {live.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
            Nothing announced right now.
          </p>
        ) : (
          <ul className="space-y-2">{live.map((a) => card(a))}</ul>
        )}
      </section>

      {mine.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Not going ahead
          </h2>
          <ul className="space-y-2">{mine.map((a) => card(a))}</ul>
        </section>
      )}
    </div>
  );
}
