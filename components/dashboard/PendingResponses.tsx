"use client";

import { useState } from "react";
import Link from "next/link";

export interface PendingRow {
  assignmentId: string;
  profileId: string;
  name: string;
  position: string;
}

type NudgeState =
  | { state: "idle" | "sending" | "sent"; note?: string; noteTone?: "error" | "info" };

/**
 * Everyone still sitting on an invitation for the next plan, with a per-row
 * "Nudge" that pushes to their devices. /api/push/send decides who may notify
 * whom — a 403 comes back with a human sentence, and we show that sentence
 * rather than translating it.
 */
export function PendingResponses({
  planDateLabel,
  planHref,
  rows,
  unfilled,
}: {
  /** e.g. "Sunday, Aug 16" — named in the push body. */
  planDateLabel: string;
  planHref: string;
  rows: PendingRow[];
  /** Invited positions with nobody assigned yet — no one to nudge. */
  unfilled: number;
}) {
  const [byId, setById] = useState<Record<string, NudgeState>>({});
  const get = (id: string): NudgeState => byId[id] ?? { state: "idle" };
  const set = (id: string, s: NudgeState) => setById((m) => ({ ...m, [id]: s }));

  async function nudge(row: PendingRow) {
    set(row.assignmentId, { state: "sending" });
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: row.profileId,
          title: "Are you serving Sunday?",
          body: `Please confirm your spot for ${planDateLabel}.`,
          url: "/services/my",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        detail?: string;
      };
      if (!res.ok) {
        // 403's message explains the permission model; surface it verbatim.
        set(row.assignmentId, {
          state: "idle",
          note: j.error ?? "Couldn't send the nudge.",
          noteTone: "error",
        });
      } else if ((j.sent ?? 0) === 0) {
        // Delivered nowhere — usually "no devices subscribed". Not an error,
        // but "Nudged" alone would be a lie worth explaining.
        set(row.assignmentId, {
          state: "sent",
          note: j.detail ?? "No devices to notify.",
          noteTone: "info",
        });
      } else {
        set(row.assignmentId, { state: "sent" });
      }
    } catch {
      set(row.assignmentId, {
        state: "idle",
        note: "Couldn't send the nudge.",
        noteTone: "error",
      });
    }
  }

  return (
    <section className="rounded-xl border border-ink-100 bg-white">
      <header className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-ink-900">
          Pending responses
        </h2>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          {planDateLabel}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-500">
          Everyone has responded.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((r) => {
            const s = get(r.assignmentId);
            return (
              <li key={r.assignmentId} className="px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                    {r.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
                    {r.position}
                  </span>
                  {s.state === "sent" ? (
                    <span className="shrink-0 rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                      Nudged
                    </span>
                  ) : (
                    <button
                      onClick={() => nudge(r)}
                      disabled={s.state === "sending"}
                      className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-onaccent transition hover:bg-accent-strong disabled:opacity-60"
                    >
                      {s.state === "sending" ? "Sending…" : "Nudge"}
                    </button>
                  )}
                </div>
                {s.note && (
                  <p
                    className={`mt-1 text-xs ${s.noteTone === "error" ? "text-brand-700" : "text-ink-400"}`}
                  >
                    {s.note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {unfilled > 0 && (
        <p className="border-t border-ink-100 px-4 py-2 text-xs text-brand-700">
          {unfilled} unfilled position{unfilled === 1 ? "" : "s"} —{" "}
          <Link href={planHref} className="font-medium underline">
            assign in Services
          </Link>
        </p>
      )}
    </section>
  );
}
