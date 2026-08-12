"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface NoteBlock {
  id: string;
  text: string;
  slide_worthy: boolean;
}

export interface ServiceNote {
  id: string;
  plan_id: string;
  author_id: string | null;
  title: string;
  body: NoteBlock[] | null;
  status: "draft" | "submitted" | "in_proclaim" | "done";
  due_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  author?: { full_name: string } | null;
}

const FLOW: ServiceNote["status"][] = ["draft", "submitted", "in_proclaim", "done"];

const STATUS_LABEL: Record<ServiceNote["status"], string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_proclaim: "In Proclaim",
  done: "Done",
};

const STATUS_STYLE: Record<ServiceNote["status"], string> = {
  draft: "bg-ink-100 text-ink-600",
  submitted: "bg-amber-100 text-amber-800",
  in_proclaim: "bg-blue-100 text-blue-800",
  done: "bg-emerald-100 text-emerald-800",
};

/**
 * Was this submitted (or materially changed) after the deadline?
 *
 * Derived rather than stored — the doc is explicit that the deadline is soft and
 * never a lock. Late work is never blocked; it is only made visible, so Media
 * sees a late addition rather than discovering it on Sunday morning.
 */
function isLate(note: ServiceNote): boolean {
  if (!note.due_at) return false;
  const marker = note.submitted_at ?? note.updated_at;
  return new Date(marker).getTime() > new Date(note.due_at).getTime();
}

const newBlock = (): NoteBlock => ({
  id: crypto.randomUUID(),
  text: "",
  slide_worthy: true,
});

export function ServiceNotes({
  planId,
  planTitle,
  initial,
  canManage,
  currentProfileId,
}: {
  planId: string;
  planTitle: string;
  initial: ServiceNote | null;
  /** Services roles (and Media) can advance the status. */
  canManage: boolean;
  currentProfileId: string;
}) {
  const supabase = createClient();
  const [note, setNote] = useState<ServiceNote | null>(initial);
  const [blocks, setBlocks] = useState<NoteBlock[]>(
    initial?.body?.length ? initial.body : [newBlock()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const isAuthor = !note || note.author_id === currentProfileId;
  const canEdit = isAuthor || canManage;
  const late = note ? isLate(note) : false;

  const slideCount = useMemo(
    () => blocks.filter((b) => b.slide_worthy && b.text.trim()).length,
    [blocks],
  );

  function update(id: string, patch: Partial<NoteBlock>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function save(nextStatus?: ServiceNote["status"]) {
    setBusy(true);
    setError(null);
    const cleaned = blocks.filter((b) => b.text.trim());
    const payload = {
      plan_id: planId,
      author_id: note?.author_id ?? currentProfileId,
      title: note?.title ?? `${planTitle} — notes`,
      body: cleaned,
      status: nextStatus ?? note?.status ?? "draft",
      ...(nextStatus === "submitted" && !note?.submitted_at
        ? { submitted_at: new Date().toISOString() }
        : {}),
    };

    let row: ServiceNote | null = null;
    if (note) {
      // Keep the previous body first: Production needs to see what changed if a
      // minister edits after slides were already built.
      await supabase
        .from("service_note_revisions")
        .insert({ note_id: note.id, body: note.body ?? [], saved_by: currentProfileId });
      const { data, error: err } = await supabase
        .from("service_notes")
        .update(payload)
        .eq("id", note.id)
        .select("*")
        .single();
      if (err) {
        setBusy(false);
        setError(err.message);
        return;
      }
      row = data as ServiceNote;
    } else {
      const { data, error: err } = await supabase
        .from("service_notes")
        .insert(payload)
        .select("*")
        .single();
      if (err) {
        setBusy(false);
        setError(err.message);
        return;
      }
      row = data as ServiceNote;
    }
    setNote(row);
    setBusy(false);
    setSaved(new Date().toLocaleTimeString());
  }

  /**
   * Media moving the work along: submitted → in Proclaim → done.
   *
   * A material edit knocks it back to submitted, because slides built from the
   * old text are now out of date and somebody has to look again.
   */
  async function advance(to: ServiceNote["status"]) {
    if (!note) return;
    setBusy(true);
    const { data, error: err } = await supabase
      .from("service_notes")
      .update({ status: to })
      .eq("id", note.id)
      .select("*")
      .single();
    setBusy(false);
    if (err) return setError(err.message);
    setNote(data as ServiceNote);
  }

  async function setDue(value: string) {
    if (!note) return;
    const iso = value ? new Date(value).toISOString() : null;
    const { data, error: err } = await supabase
      .from("service_notes")
      .update({ due_at: iso })
      .eq("id", note.id)
      .select("*")
      .single();
    if (err) return setError(err.message);
    setNote(data as ServiceNote);
  }

  const status = note?.status ?? "draft";

  return (
    <section className="mt-6 rounded-xl border border-ink-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink-900">Notes for Media</h2>
        <div className="flex flex-wrap items-center gap-2">
          {late && (
            <span
              className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800"
              title="Submitted or edited after the deadline — Media should take another look"
            >
              Late
            </span>
          )}
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">
        What you want on screen. Media builds these in Proclaim — tick the lines that belong on
        a slide; the rest are just for you.
      </p>

      {canEdit ? (
        <>
          <ul className="mt-3 space-y-2">
            {blocks.map((b, i) => (
              <li key={b.id} className="flex gap-2">
                <label
                  className="mt-2 flex shrink-0 items-center"
                  title={b.slide_worthy ? "Goes on a slide" : "Speaking notes only"}
                >
                  <input
                    type="checkbox"
                    checked={b.slide_worthy}
                    onChange={(e) => update(b.id, { slide_worthy: e.target.checked })}
                    aria-label="Show this on a slide"
                  />
                </label>
                <textarea
                  value={b.text}
                  onChange={(e) => update(b.id, { text: e.target.value })}
                  rows={2}
                  placeholder={i === 0 ? "A point, a verse, a quote…" : ""}
                  className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm ${
                    b.slide_worthy ? "border-ink-200" : "border-dashed border-ink-200 bg-ink-50"
                  }`}
                />
                <button
                  onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}
                  aria-label="Remove this line"
                  className="mt-1 shrink-0 self-start rounded px-2 py-1 text-ink-400 hover:text-red-600"
                >
                  <Icon name="x" size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setBlocks((bs) => [...bs, newBlock()])}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              + Add a line
            </button>
            <span className="text-xs text-ink-400">
              {slideCount} of {blocks.filter((b) => b.text.trim()).length} on slides
            </span>
            <button
              onClick={() => save()}
              disabled={busy}
              className="ml-auto rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
            <button
              onClick={() => save("submitted")}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-50"
            >
              Send to Media
            </button>
          </div>
          {saved && <p className="mt-1 text-xs text-ink-400">Saved at {saved}.</p>}
        </>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {(note?.body ?? []).map((b) => (
            <li
              key={b.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                b.slide_worthy
                  ? "bg-ink-50 text-ink-900"
                  : "text-ink-500 italic"
              }`}
            >
              {b.slide_worthy && (
                <span className="mr-2 text-[10px] font-bold uppercase tracking-wide text-brand-500">
                  slide
                </span>
              )}
              {b.text}
            </li>
          ))}
          {(note?.body ?? []).length === 0 && (
            <li className="text-sm text-ink-400">Nothing submitted yet.</li>
          )}
        </ol>
      )}

      {note && canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <label className="text-xs text-ink-500">
            Due
            <input
              type="datetime-local"
              defaultValue={note.due_at ? note.due_at.slice(0, 16) : ""}
              onChange={(e) => setDue(e.target.value)}
              className="ml-2 rounded-lg border border-ink-200 px-2 py-1 text-sm"
            />
          </label>
          <span className="text-xs text-ink-400">
            A reminder, not a lock — late notes still go through.
          </span>
          {FLOW.indexOf(status) < FLOW.length - 1 && status !== "draft" && (
            <button
              onClick={() => advance(FLOW[FLOW.indexOf(status) + 1])}
              disabled={busy}
              className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-50"
            >
              Mark {STATUS_LABEL[FLOW[FLOW.indexOf(status) + 1]]}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
