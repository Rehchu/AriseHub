"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/Icon";

export interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  people_created: number;
  people_updated: number;
  groups_created: number;
  groups_updated: number;
  errors: string[] | null;
}

interface Result {
  dryRun: boolean;
  status?: string;
  peopleCreated: number;
  peopleUpdated: number;
  groupsCreated: number;
  groupsUpdated: number;
  errors?: string[];
}

const STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  failed: "bg-brand-50 text-brand-700",
  running: "bg-ink-100 text-ink-500",
};

/**
 * Elvanto sync (one-way: Elvanto → AriseHub).
 *
 * Elvanto stays the source of truth for people and groups; AriseHub keeps what
 * it owns — roles, departments, chat, tasks, check-in — untouched.
 */
export function ElvantoSync({
  runs,
  linkedCount,
  configured,
}: {
  runs: SyncRun[];
  linkedCount: number;
  configured: boolean;
}) {
  const [busy, setBusy] = useState<"dry" | "live" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (
      !dryRun &&
      !window.confirm(
        "Run a live sync?\n\nThis creates and updates people and groups in AriseHub from Elvanto. Roles, departments and campuses are not changed.",
      )
    )
      return;

    setBusy(dryRun ? "dry" : "live");
    setError(null);
    setResult(null);

    const res = await fetch("/api/integrations/elvanto/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });
    const j = (await res.json().catch(() => ({}))) as Result & { error?: string };
    setBusy(null);

    if (!res.ok) {
      setError(j.error ?? "Sync failed.");
      return;
    }
    setResult(j);
  }

  return (
    <div>
      <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
        <strong>One-way sync.</strong> Elvanto is the source of truth for people
        and groups; AriseHub pulls them in. Roles, departments, campuses, chat,
        tasks and check-in stay AriseHub&apos;s — nothing is ever written back to
        Elvanto.
      </p>

      {!configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-display font-semibold text-amber-900">
            Elvanto isn&apos;t connected yet
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Get an API key in Elvanto (<em>Settings → Integrations → API</em>), then
            add it to the AriseHub Worker as the secret{" "}
            <code className="rounded bg-white px-1">ELVANTO_API_KEY</code>:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">
npx wrangler secret put ELVANTO_API_KEY
          </pre>
          <p className="mt-2 text-xs text-amber-700">
            Keep the key out of chat and email — it can read your whole people
            database.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => run(true)}
              disabled={busy !== null}
              className="rounded-lg bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-200 disabled:opacity-60"
            >
              {busy === "dry" ? "Checking…" : "Preview changes"}
            </button>
            <button
              onClick={() => run(false)}
              disabled={busy !== null}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
            >
              <Icon name="arrowRight" size={16} />
              {busy === "live" ? "Syncing…" : "Sync now"}
            </button>
            <span className="text-sm text-ink-500">
              {linkedCount} {linkedCount === 1 ? "person" : "people"} linked to Elvanto
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Preview reports what would change without writing anything — worth running
            first.
          </p>
        </>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-ink-100 bg-white p-4">
          <h3 className="font-display font-semibold text-ink-900">
            {result.dryRun ? "Preview — nothing was changed" : "Sync complete"}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={result.dryRun ? "Would add" : "People added"} value={result.peopleCreated} />
            <Stat label={result.dryRun ? "Would update" : "People updated"} value={result.peopleUpdated} />
            <Stat label="Groups added" value={result.groupsCreated} />
            <Stat label="Groups updated" value={result.groupsUpdated} />
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                {result.errors.length} record{result.errors.length === 1 ? "" : "s"} had problems:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Recent syncs
      </h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-ink-100 bg-white">
        {runs.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLE[r.status] ?? "bg-ink-100 text-ink-500"}`}>
              {r.status}
            </span>
            <span className="text-sm text-ink-700">
              {new Date(r.started_at).toLocaleString()}
            </span>
            <span className="flex-1" />
            <span className="text-xs text-ink-500">
              +{r.people_created} / ~{r.people_updated} people
              {(r.groups_created > 0 || r.groups_updated > 0) &&
                ` · +${r.groups_created} / ~${r.groups_updated} groups`}
            </span>
          </div>
        ))}
        {runs.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-400">No syncs yet.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-ink-50 p-2.5">
      <p className="text-lg font-bold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </div>
  );
}
