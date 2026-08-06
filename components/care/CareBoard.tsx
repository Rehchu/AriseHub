"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface CareItem {
  id: string;
  title: string;
  about_name: string | null;
  about_profile_id: string | null;
  category: "visitation" | "follow_up" | "prayer" | "benevolence" | "other";
  stage: "new" | "contacted" | "scheduled" | "resolved";
  priority: "low" | "normal" | "high";
  assigned_to: string | null;
  notes: string | null;
  due_at: string | null;
  assignee: { full_name: string } | null;
}

const STAGES: { key: CareItem["stage"]; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "scheduled", label: "Scheduled" },
  { key: "resolved", label: "Resolved" },
];
const CATEGORIES: CareItem["category"][] = [
  "visitation",
  "follow_up",
  "prayer",
  "benevolence",
  "other",
];
const PRIORITY_COLOR: Record<string, string> = {
  high: "#be123c",
  normal: "#6d6e76",
  low: "#9a9ba1",
};

export function CareBoard({
  initial,
  people,
  currentProfileId,
}: {
  initial: CareItem[];
  people: { id: string; full_name: string }[];
  currentProfileId: string;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<CareItem[]>(initial);
  const [showNew, setShowNew] = useState(false);

  async function move(item: CareItem, dir: 1 | -1) {
    const idx = STAGES.findIndex((s) => s.key === item.stage);
    const next = STAGES[idx + dir];
    if (!next) return;
    setItems((its) => its.map((x) => (x.id === item.id ? { ...x, stage: next.key } : x)));
    await supabase.from("care_items").update({ stage: next.key }).eq("id", item.id);
  }

  async function assign(item: CareItem, profileId: string) {
    const name = people.find((p) => p.id === profileId)?.full_name ?? null;
    setItems((its) =>
      its.map((x) =>
        x.id === item.id
          ? { ...x, assigned_to: profileId || null, assignee: name ? { full_name: name } : null }
          : x,
      ),
    );
    await supabase.from("care_items").update({ assigned_to: profileId || null }).eq("id", item.id);
  }

  function addLocal(it: CareItem) {
    setItems((its) => [it, ...its]);
  }

  return (
    <div className="px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Pastoral Care</h1>
          <p className="mt-1 text-ink-500">Visitation & follow-up — visible to pastoral staff only.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Icon name="heart" size={18} /> New care item
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((stage) => {
          const col = items.filter((i) => i.stage === stage.key);
          return (
            <div key={stage.key} className="rounded-xl bg-ink-100/50 p-3">
              <h2 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-500">
                {stage.label}
                <span className="rounded-full bg-white px-2 py-0.5 text-ink-400">{col.length}</span>
              </h2>
              <div className="space-y-2">
                {col.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-white p-3 shadow-sm"
                    style={{ borderLeft: `3px solid ${PRIORITY_COLOR[item.priority]}` }}
                  >
                    <p className="font-medium text-ink-900">{item.title}</p>
                    {(item.about_name || item.assignee) && (
                      <p className="mt-0.5 text-xs text-ink-400">
                        {item.about_name && `About ${item.about_name}`}
                        {item.assignee && ` · ${item.assignee.full_name}`}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-400">
                      {item.category.replace("_", " ")}
                    </p>
                    {item.notes && <p className="mt-1 text-sm text-ink-600">{item.notes}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={item.assigned_to ?? ""}
                        onChange={(e) => assign(item, e.target.value)}
                        className="ah-input w-full py-1 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                      </select>
                      <div className="flex shrink-0 gap-1">
                        {stage.key !== "new" && (
                          <button onClick={() => move(item, -1)} className="rounded p-1 text-ink-400 hover:bg-ink-100" aria-label="Move back">
                            ←
                          </button>
                        )}
                        {stage.key !== "resolved" && (
                          <button onClick={() => move(item, 1)} className="rounded p-1 text-brand-500 hover:bg-brand-50" aria-label="Move forward">
                            <Icon name="arrowRight" size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {col.length === 0 && (
                  <p className="rounded-lg border border-dashed border-ink-200 px-2 py-4 text-center text-xs text-ink-400">
                    Empty
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <NewCare
          people={people}
          currentProfileId={currentProfileId}
          onClose={() => setShowNew(false)}
          onCreated={addLocal}
        />
      )}
    </div>
  );
}

function NewCare({
  people,
  currentProfileId,
  onClose,
  onCreated,
}: {
  people: { id: string; full_name: string }[];
  currentProfileId: string;
  onClose: () => void;
  onCreated: (i: CareItem) => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [category, setCategory] = useState<CareItem["category"]>("follow_up");
  const [priority, setPriority] = useState<CareItem["priority"]>("normal");
  const [assigned, setAssigned] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("care_items")
      .insert({
        title: title.trim(),
        about_name: about.trim() || null,
        category,
        priority,
        assigned_to: assigned || null,
        notes: notes.trim() || null,
        created_by: currentProfileId,
      })
      .select("id, title, about_name, about_profile_id, category, stage, priority, assigned_to, notes, due_at")
      .single();
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create.");
      return;
    }
    const assignee = assigned ? { full_name: people.find((p) => p.id === assigned)?.full_name ?? "" } : null;
    onCreated({ ...(data as CareItem), assignee });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">New care item</h2>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>
        <input className="ah-input" placeholder="What's needed? (e.g. Hospital visit — the Johnsons)" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        <input className="ah-input" placeholder="Who is this about? (name)" value={about} onChange={(e) => setAbout(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-600">Category</span>
            <select className="ah-input capitalize" value={category} onChange={(e) => setCategory(e.target.value as CareItem["category"])}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-600">Priority</span>
            <select className="ah-input" value={priority} onChange={(e) => setPriority(e.target.value as CareItem["priority"])}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-600">Assign to</span>
          <select className="ah-input" value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <textarea className="ah-input min-h-20" placeholder="Notes (kept private to pastoral staff)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {busy ? "Saving…" : "Add to board"}
        </button>
      </form>
    </div>
  );
}
