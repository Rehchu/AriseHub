"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Stage {
  id: string;
  pipeline_id: string;
  position: number;
  name: string;
  stall_days: number;
}

export interface Card {
  id: string;
  pipeline_id: string;
  stage_id: string;
  person_id: string | null;
  person_name: string | null;
  contact: string | null;
  assigned_to: string | null;
  entered_stage_at: string;
  notes: string | null;
  closed_at: string | null;
  person?: { full_name: string } | null;
  owner?: { full_name: string } | null;
}

export interface Alert {
  id: string;
  person_id: string;
  baseline: string | null;
  weeks_absent: number;
  status: "new" | "assigned" | "resolved" | "dismissed";
  flagged_at: string;
  person?: { full_name: string } | null;
}

const DAY = 86_400_000;

/** Days a card has sat in its current stage. */
const daysInStage = (card: Card) =>
  Math.floor((Date.now() - new Date(card.entered_stage_at).getTime()) / DAY);

export function FollowUpBoard({
  stages,
  cards,
  alerts,
  people,
  canManage,
  currentProfileId,
}: {
  stages: Stage[];
  cards: Card[];
  alerts: Alert[];
  people: { id: string; full_name: string }[];
  canManage: boolean;
  currentProfileId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );
  const open = useMemo(() => cards.filter((c) => !c.closed_at), [cards]);
  const openAlerts = useMemo(
    () => alerts.filter((a) => a.status === "new" || a.status === "assigned"),
    [alerts],
  );

  /** Cards past their stage's stall window — the whole point of the module. */
  const stalled = useMemo(() => {
    const limit = new Map(ordered.map((s) => [s.id, s.stall_days]));
    return open.filter((c) => daysInStage(c) > (limit.get(c.stage_id) ?? 14));
  }, [open, ordered]);

  async function move(card: Card, direction: 1 | -1) {
    const i = ordered.findIndex((s) => s.id === card.stage_id);
    const next = ordered[i + direction];
    if (!next) return;
    setBusy(true);
    // entered_stage_at resets: the stall clock is per stage, not per card.
    const { error: err } = await supabase
      .from("pipeline_cards")
      .update({ stage_id: next.id, entered_stage_at: new Date().toISOString() })
      .eq("id", card.id);
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }

  async function closeCard(card: Card) {
    setBusy(true);
    const { error: err } = await supabase
      .from("pipeline_cards")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", card.id);
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }

  async function assign(card: Card, to: string) {
    setBusy(true);
    const { error: err } = await supabase
      .from("pipeline_cards")
      .update({ assigned_to: to || null })
      .eq("id", card.id);
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }

  async function addCard(form: FormData) {
    const first = ordered[0];
    if (!first) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("pipeline_cards").insert({
      pipeline_id: first.pipeline_id,
      stage_id: first.id,
      person_name: String(form.get("name") ?? "").trim() || null,
      contact: String(form.get("contact") ?? "").trim() || null,
      assigned_to: String(form.get("owner") ?? "") || currentProfileId,
      notes: String(form.get("notes") ?? "").trim() || null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setAdding(false);
    router.refresh();
  }

  /** Run the drop-off scan on demand, rather than waiting for the weekly job. */
  async function scan() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("scan_attendance_drop_offs");
    setBusy(false);
    if (err) return setError(err.message);
    setScanned(
      data === 0 ? "No new drop-offs — everyone's turning up." : `Flagged ${data}.`,
    );
    router.refresh();
  }

  /** Turn a drop-off into a card someone owns. */
  async function toCard(alert: Alert) {
    const first = ordered[0];
    if (!first) return setError("Set up a pipeline first.");
    setBusy(true);
    const { error: e1 } = await supabase.from("pipeline_cards").insert({
      pipeline_id: first.pipeline_id,
      stage_id: first.id,
      person_id: alert.person_id,
      person_name: alert.person?.full_name ?? null,
      assigned_to: currentProfileId,
      notes: `Hasn't been in ${alert.weeks_absent} weeks (was ${alert.baseline ?? "regular"}).`,
    });
    if (!e1) {
      await supabase
        .from("attendance_alerts")
        .update({ status: "assigned", assigned_to: currentProfileId })
        .eq("id", alert.id);
    }
    setBusy(false);
    if (e1) return setError(e1.message);
    router.refresh();
  }

  async function setAlert(alert: Alert, status: Alert["status"]) {
    setBusy(true);
    await supabase.from("attendance_alerts").update({ status }).eq("id", alert.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">Follow-up</h1>
        {canManage && ordered.length > 0 && (
          <button
            onClick={() => setAdding((a) => !a)}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
          >
            {adding ? "Cancel" : "Add someone"}
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-ink-500">
        Who we&apos;re walking with, and who we haven&apos;t seen in a while.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {ordered.length === 0 && (
        <p className="mb-6 rounded-xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
          No pipeline set up yet. Create one in the database with stages like first visit →
          contacted → in a group → serving → member.
        </p>
      )}

      {adding && ordered.length > 0 && (
        <form action={addCard} className="mb-6 grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2">
          <label className="text-sm text-ink-700">
            Name
            <input name="name" required className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-ink-700">
            Phone or email
            <input name="contact" className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-ink-700">
            Who&apos;s following up
            <select name="owner" defaultValue={currentProfileId} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm">
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-700">
            Notes
            <input name="notes" className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent disabled:opacity-50">
              Add to {ordered[0].name}
            </button>
          </div>
        </form>
      )}

      {stalled.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Stalled ({stalled.length})
          </h2>
          <p className="mt-0.5 text-xs text-amber-800">
            Sitting longer than the stage allows. These are the ones that go quiet.
          </p>
          <ul className="mt-2 space-y-1">
            {stalled.map((c) => (
              <li key={c.id} className="text-sm text-amber-900">
                <strong>{c.person?.full_name ?? c.person_name ?? "Someone"}</strong> —{" "}
                {daysInStage(c)} days in {ordered.find((s) => s.id === c.stage_id)?.name}
                {c.owner?.full_name ? ` · ${c.owner.full_name}` : " · nobody assigned"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ordered.map((stage) => {
        const inStage = open.filter((c) => c.stage_id === stage.id);
        return (
          <section key={stage.id} className="mb-4">
            <h2 className="mb-2 flex items-baseline gap-2 text-xs font-bold uppercase tracking-wide text-ink-500">
              {stage.name}
              <span className="font-normal normal-case text-ink-400">
                {inStage.length} · stalls after {stage.stall_days}d
              </span>
            </h2>
            {inStage.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">
                Nobody here.
              </p>
            ) : (
              <ul className="space-y-2">
                {inStage.map((c) => {
                  const overdue = daysInStage(c) > stage.stall_days;
                  return (
                    <li
                      key={c.id}
                      className={`rounded-xl border bg-white p-3 ${
                        overdue ? "border-amber-300" : "border-ink-100"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-ink-900">
                          {c.person?.full_name ?? c.person_name ?? "Someone"}
                        </span>
                        <span className={`text-xs ${overdue ? "text-amber-700" : "text-ink-400"}`}>
                          {daysInStage(c)}d here
                        </span>
                      </div>
                      {c.contact && <p className="text-xs text-ink-500">{c.contact}</p>}
                      {c.notes && <p className="mt-1 text-sm text-ink-700">{c.notes}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={c.assigned_to ?? ""}
                          onChange={(e) => assign(c, e.target.value)}
                          disabled={busy}
                          aria-label="Who's following up"
                          className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
                        >
                          <option value="">Nobody assigned</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>{p.full_name}</option>
                          ))}
                        </select>
                        <button onClick={() => move(c, -1)} disabled={busy} className="rounded border border-ink-200 px-2 py-1 text-xs disabled:opacity-40">
                          ‹ Back
                        </button>
                        <button onClick={() => move(c, 1)} disabled={busy} className="rounded border border-ink-200 px-2 py-1 text-xs disabled:opacity-40">
                          Next ›
                        </button>
                        <button onClick={() => closeCard(c)} disabled={busy} className="ml-auto text-xs text-ink-400 hover:text-ink-700">
                          Close
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <section className="mt-8 border-t border-ink-100 pt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink-900">
            Haven&apos;t seen in a while
          </h2>
          {canManage && (
            <button
              onClick={scan}
              disabled={busy}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-700 disabled:opacity-50"
            >
              {busy ? "Checking…" : "Check now"}
            </button>
          )}
        </div>
        {scanned && <p className="mb-2 text-xs text-ink-500">{scanned}</p>}
        {openAlerts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
            Nobody flagged. People who attended regularly and stop showing up appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {openAlerts.map((a) => (
              <li key={a.id} className="rounded-xl border border-ink-100 bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-900">
                    {a.person?.full_name ?? "Someone"}
                  </span>
                  <span className="text-xs text-ink-400">
                    {a.weeks_absent} weeks · was {a.baseline ?? "regular"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => toCard(a)}
                    disabled={busy}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent disabled:opacity-50"
                  >
                    I&apos;ll reach out
                  </button>
                  <button
                    onClick={() => setAlert(a, "resolved")}
                    disabled={busy}
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700"
                  >
                    Already back
                  </button>
                  <button
                    onClick={() => setAlert(a, "dismissed")}
                    disabled={busy}
                    className="ml-auto text-xs text-ink-400 hover:text-ink-700"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
