"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { notify } from "@/lib/notify";
import {
  availabilityFor,
  type Blockout,
  type ServingPattern,
} from "@/lib/availability";

export interface Item {
  id: string;
  sort_order: number;
  title: string;
  item_type: "song" | "scripture" | "sermon" | "announcement" | "transition" | "prayer" | "other";
  duration_minutes: number | null;
  notes: string | null;
}
export interface Assignment {
  id: string;
  position: string;
  profile_id: string | null;
  status: "invited" | "accepted" | "declined";
  assignee: { full_name: string } | null;
}
interface Plan {
  id: string;
  title: string;
  service_date: string;
  notes: string | null;
}

const ITEM_TYPES: Item["item_type"][] = [
  "song",
  "scripture",
  "sermon",
  "announcement",
  "transition",
  "prayer",
  "other",
];

export function PlanDetail({
  plan,
  initialItems,
  initialAssignments,
  people,
  songs = [],
  canManage,
  currentProfileId,
  blockouts = [],
  patterns = [],
  alreadyServing = {},
}: {
  plan: Plan;
  initialItems: Item[];
  initialAssignments: Assignment[];
  people: { id: string; full_name: string }[];
  songs?: { id: string; title: string; artist: string | null; default_key: string | null }[];
  canManage: boolean;
  currentProfileId: string;
  blockouts?: Blockout[];
  patterns?: ServingPattern[];
  alreadyServing?: Record<string, string>;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);

  const [itTitle, setItTitle] = useState("");
  const [itType, setItType] = useState<Item["item_type"]>("song");
  const [itDur, setItDur] = useState("");
  const [itSong, setItSong] = useState("");

  const [posName, setPosName] = useState("");
  const [posPerson, setPosPerson] = useState("");
  const [dupDate, setDupDate] = useState("");
  const [dupPeople, setDupPeople] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const planDate = new Date(plan.service_date + "T00:00:00");

  // Availability label for the person picker, e.g. 'Away — Vacation'.
  function availLabel(profileId: string): { text: string; tone: string } | null {
    if (alreadyServing[profileId]) {
      return { text: "Already on " + alreadyServing[profileId], tone: "text-amber-700" };
    }
    const a = availabilityFor(profileId, planDate, blockouts, patterns);
    if (a.state === "blocked") return { text: "Away — " + (a.reason ?? ""), tone: "text-brand-600" };
    if (a.state === "off-pattern") return { text: a.reason ?? "Off pattern", tone: "text-ink-400" };
    return null;
  }

  const totalMin = useMemo(
    () => items.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0),
    [items],
  );

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itTitle.trim()) return;
    const { data } = await supabase
      .from("plan_items")
      .insert({
        plan_id: plan.id,
        title: itTitle.trim(),
        item_type: itType,
        duration_minutes: itDur ? Number(itDur) : null,
        song_id: itType === "song" && itSong ? itSong : null,
        sort_order: items.length,
      })
      .select("*")
      .single();
    if (data) setItems((it) => [...it, data as Item]);
    setItTitle("");
    setItDur("");
  }

  async function removeItem(id: string) {
    setItems((it) => it.filter((x) => x.id !== id));
    await supabase.from("plan_items").delete().eq("id", id);
  }

  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    if (!posName.trim()) return;
    const { data } = await supabase
      .from("plan_assignments")
      .insert({
        plan_id: plan.id,
        position: posName.trim(),
        profile_id: posPerson || null,
        status: "invited",
      })
      .select("id, position, profile_id, status")
      .single();
    if (data) {
      const assignee = posPerson
        ? { full_name: people.find((p) => p.id === posPerson)?.full_name ?? "" }
        : null;
      setAssignments((a) => [...a, { ...(data as Assignment), assignee }]);
      // Tell them they've been scheduled — a scheduler nobody hears from
      // gets ignored.
      if (posPerson && posPerson !== currentProfileId) {
        notify(
          posPerson,
          "You've been scheduled",
          plan.title + " — " + posName.trim() + " on " +
            planDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
          "/services/" + plan.id,
        );
      }
    }
    setPosName("");
    setPosPerson("");
  }

  async function removePosition(id: string) {
    setAssignments((a) => a.filter((x) => x.id !== id));
    await supabase.from("plan_assignments").delete().eq("id", id);
  }

  /**
   * Copy this plan to another date.
   *
   * The running order always carries over — that's the point. Whether the
   * PEOPLE carry over is a choice: a rota often repeats, but assuming it
   * silently would schedule someone without asking, so positions copy across
   * as 'invited' and they still have to accept.
   */
  async function duplicate() {
    if (!dupDate) return;
    setDuplicating(true);

    const { data: newPlan, error } = await supabase
      .from("service_plans")
      .insert({
        title: plan.title,
        service_date: dupDate,
        notes: plan.notes,
        created_by: currentProfileId,
      })
      .select("id")
      .single();

    if (error || !newPlan) {
      setDuplicating(false);
      window.alert(error?.message ?? "Could not duplicate this plan.");
      return;
    }
    const newId = (newPlan as { id: string }).id;

    if (items.length) {
      await supabase.from("plan_items").insert(
        items.map((i, idx) => ({
          plan_id: newId,
          title: i.title,
          item_type: i.item_type,
          duration_minutes: i.duration_minutes,
          notes: i.notes,
          sort_order: idx,
        })),
      );
    }

    if (assignments.length) {
      await supabase.from("plan_assignments").insert(
        assignments.map((a) => ({
          plan_id: newId,
          position: a.position,
          // Keep the position either way; only carry the person if asked.
          profile_id: dupPeople ? a.profile_id : null,
          status: "invited",
        })),
      );
    }

    window.location.href = "/services/" + newId;
  }

  async function respond(a: Assignment, status: "accepted" | "declined") {
    setAssignments((as) => as.map((x) => (x.id === a.id ? { ...x, status } : x)));
    await supabase.from("plan_assignments").update({ status }).eq("id", a.id);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <a href="/services" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← All plans
      </a>
      <h1 className="font-display text-2xl font-bold text-ink-900">{plan.title}</h1>
      <p className="mt-1 text-ink-500">
        {new Date(plan.service_date + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Running sheet */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Order of service</h2>
            <span className="text-xs font-medium text-ink-500">{totalMin} min total</span>
          </div>
          <div className="space-y-2">
            {items.map((i, idx) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-xs font-medium text-ink-500">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-800">{i.title}</p>
                  <p className="text-xs capitalize text-ink-400">{i.item_type}</p>
                </div>
                {i.duration_minutes != null && (
                  <span className="text-xs text-ink-400">{i.duration_minutes}m</span>
                )}
                {canManage && (
                  <button onClick={() => removeItem(i.id)} className="text-ink-400 hover:text-brand-600" aria-label="Remove item">
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            ))}
            {items.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
                No items yet.
              </p>
            )}
          </div>
          {canManage && (
            <form onSubmit={addItem} className="mt-3 space-y-2 rounded-xl border border-ink-100 bg-ink-50 p-3">
              {itType === "song" && songs.length > 0 ? (
                <select
                  className="ah-input"
                  value={itSong}
                  onChange={(e) => {
                    setItSong(e.target.value);
                    const s = songs.find((x) => x.id === e.target.value);
                    if (s) setItTitle(s.title + (s.default_key ? " (" + s.default_key + ")" : ""));
                  }}
                >
                  <option value="">Choose a song…</option>
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                      {s.artist ? " — " + s.artist : ""}
                      {s.default_key ? " · " + s.default_key : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="ah-input" placeholder="Item (e.g. Great Are You Lord)" value={itTitle} onChange={(e) => setItTitle(e.target.value)} />
              )}
              <div className="flex gap-2">
                <select className="ah-input capitalize" value={itType} onChange={(e) => setItType(e.target.value as Item["item_type"])}>
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t}
                    </option>
                  ))}
                </select>
                <input type="number" min={0} className="ah-input w-24" placeholder="min" value={itDur} onChange={(e) => setItDur(e.target.value)} />
                <button type="submit" className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong">
                  Add
                </button>
              </div>
            </form>
          )}
        </section>

          {canManage && (
            <div className="mt-4 rounded-xl border border-ink-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                Reuse this plan
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Copies the whole running order to another date.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  type="date"
                  className="ah-input w-auto"
                  value={dupDate}
                  onChange={(e) => setDupDate(e.target.value)}
                />
                <button
                  onClick={duplicate}
                  disabled={!dupDate || duplicating}
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-50"
                >
                  {duplicating ? "Copying…" : "Duplicate"}
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={dupPeople}
                  onChange={(e) => setDupPeople(e.target.checked)}
                />
                Keep the same people (they&apos;ll still need to accept)
              </label>
            </div>
          )}

        {/* Volunteer scheduling */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Team</h2>
          <div className="space-y-2">
            {assignments.map((a) => {
              const mine = a.profile_id === currentProfileId;
              return (
                <div key={a.id} className="rounded-xl border border-ink-100 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-800">{a.position}</p>
                      <p className="text-xs text-ink-400">{a.assignee?.full_name ?? "Unassigned"}</p>
                    </div>
                    <StatusBadge status={a.status} />
                    {canManage && (
                      <button onClick={() => removePosition(a.id)} className="text-ink-400 hover:text-brand-600" aria-label="Remove">
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                  {a.profile_id && availLabel(a.profile_id) && (
                    <p className={"mt-1 flex items-center gap-1 text-xs " + (availLabel(a.profile_id)!.tone)}>
                      <Icon name="help" size={12} /> {availLabel(a.profile_id)!.text}
                    </p>
                  )}
                  {mine && a.status === "invited" && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => respond(a, "accepted")} className="flex-1 rounded-lg bg-emerald-700 py-1.5 text-sm font-medium text-onaccent hover:bg-emerald-800">
                        Accept
                      </button>
                      <button onClick={() => respond(a, "declined")} className="flex-1 rounded-lg bg-ink-100 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-200">
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {assignments.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
                No positions yet.
              </p>
            )}
          </div>
          {canManage && (
            <form onSubmit={addPosition} className="mt-3 space-y-2 rounded-xl border border-ink-100 bg-ink-50 p-3">
              <input className="ah-input" placeholder="Position (e.g. Acoustic Guitar)" value={posName} onChange={(e) => setPosName(e.target.value)} />
              <div className="flex gap-2">
                <select className="ah-input" value={posPerson} onChange={(e) => setPosPerson(e.target.value)}>
                  <option value="">Assign later</option>
                  {people.map((p) => {
                    const a = availLabel(p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.full_name}{a ? " · " + a.text : ""}
                      </option>
                    );
                  })}
                </select>
                <button type="submit" className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong">
                  Add
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Assignment["status"] }) {
  const style =
    status === "accepted"
      ? "bg-emerald-50 text-emerald-700"
      : status === "declined"
        ? "bg-ink-100 text-ink-400"
        : "bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}
