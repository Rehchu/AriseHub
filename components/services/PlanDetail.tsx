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
  song_key: string | null;
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

/** Elapsed minutes → a running-clock label ("0:00", "0:24", "1:05"). */
function clockAt(min: number) {
  return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0");
}

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
  departmentName = null,
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
  departmentName?: string | null;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);

  // A volunteer arriving from a "you've been scheduled" push wants their
  // invitation front and centre; everyone else wants the running order.
  const [tab, setTab] = useState<"order" | "teams">(() =>
    initialAssignments.some((a) => a.profile_id === currentProfileId && a.status === "invited")
      ? "teams"
      : "order",
  );

  const [itTitle, setItTitle] = useState("");
  const [itType, setItType] = useState<Item["item_type"]>("song");
  const [itDur, setItDur] = useState("");
  const [itSong, setItSong] = useState("");

  const [posName, setPosName] = useState("");
  const [posPerson, setPosPerson] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [dupDate, setDupDate] = useState("");
  const [dupPeople, setDupPeople] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [removeItemError, setRemoveItemError] = useState<string | null>(null);
  const [addingPos, setAddingPos] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);
  const [removePositionError, setRemovePositionError] = useState<string | null>(null);

  const planDate = new Date(plan.service_date + "T00:00:00");

  // Availability label for the person picker, e.g. 'Away — Vacation'.
  function availLabel(profileId: string): { text: string; tone: string } | null {
    if (alreadyServing[profileId]) {
      return { text: "Already on " + alreadyServing[profileId], tone: "text-brand-700" };
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

  // Running clock: each row starts where the previous durations end. The plan
  // stores no start-of-service time, so this is elapsed time from the top.
  const startTimes = useMemo(() => {
    let acc = 0;
    return items.map((i) => {
      const start = acc;
      acc += i.duration_minutes ?? 0;
      return start;
    });
  }, [items]);

  const filled = assignments.filter((a) => a.profile_id).length;
  const acceptedCount = assignments.filter((a) => a.status === "accepted").length;
  const pendingCount = assignments.filter((a) => a.profile_id && a.status === "invited").length;
  const declinedCount = assignments.filter((a) => a.status === "declined").length;
  const unfilled = assignments.length - filled;

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itTitle.trim()) return;
    setAddingItem(true);
    setItemError(null);
    const chosenSong = itType === "song" && itSong ? songs.find((s) => s.id === itSong) : undefined;
    const { data, error } = await supabase
      .from("plan_items")
      .insert({
        plan_id: plan.id,
        title: itTitle.trim(),
        item_type: itType,
        duration_minutes: itDur ? Number(itDur) : null,
        song_id: chosenSong?.id ?? null,
        song_key: chosenSong?.default_key ?? null,
        sort_order: items.length,
      })
      .select("*")
      .single();
    setAddingItem(false);
    if (error) return setItemError(error.message);
    if (!data) return setItemError("Couldn't add — try again");
    setItems((it) => [...it, data as Item]);
    setItTitle("");
    setItDur("");
    setItSong("");
  }

  async function removeItem(id: string) {
    // Mirror IdeasBoard.remove: an RLS refusal returns zero rows and a null
    // error, which an unchecked delete cannot tell from success. Optimistically
    // drop the row, verify with .select, and put it back on any failure.
    const previous = items;
    setRemoveItemError(null);
    setItems((it) => it.filter((x) => x.id !== id));
    const { data, error } = await supabase.from("plan_items").delete().eq("id", id).select("id");
    if (error || !data?.length) {
      setItems(previous);
      setRemoveItemError("Couldn't remove — try again");
    }
  }

  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    if (!posName.trim()) return;
    setAddingPos(true);
    setPosError(null);
    const { data, error } = await supabase
      .from("plan_assignments")
      .insert({
        plan_id: plan.id,
        position: posName.trim(),
        profile_id: posPerson || null,
        status: "invited",
      })
      .select("id, position, profile_id, status")
      .single();
    setAddingPos(false);
    if (error) return setPosError(error.message);
    if (!data) return setPosError("Couldn't add — try again");
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
    setPosName("");
    setPosPerson("");
  }

  /** Fill an existing unfilled position — same invite semantics as adding one. */
  async function assignPerson(a: Assignment, personId: string) {
    const fullName = people.find((p) => p.id === personId)?.full_name ?? "";
    setAssignments((as) =>
      as.map((x) =>
        x.id === a.id
          ? { ...x, profile_id: personId, status: "invited", assignee: { full_name: fullName } }
          : x,
      ),
    );
    setPickerFor(null);
    await supabase
      .from("plan_assignments")
      .update({ profile_id: personId, status: "invited" })
      .eq("id", a.id);
    if (personId !== currentProfileId) {
      notify(
        personId,
        "You've been scheduled",
        plan.title + " — " + a.position + " on " +
          planDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
        "/services/" + plan.id,
      );
    }
  }

  async function removePosition(id: string) {
    // Same verified-delete as removeItem: an RLS refusal returns zero rows and a
    // null error, so verify with .select and restore the row on any failure.
    const previous = assignments;
    setRemovePositionError(null);
    setAssignments((a) => a.filter((x) => x.id !== id));
    const { data, error } = await supabase
      .from("plan_assignments")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data?.length) {
      setAssignments(previous);
      setRemovePositionError("Couldn't remove — try again");
    }
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

    // The order and the positions are the substance of the copy. If either
    // secondary insert fails we still have a plan to land on, but it is only
    // half a copy — say so rather than silently dropping the volunteer onto it.
    let partial = false;

    if (items.length) {
      const { error: itemsError } = await supabase.from("plan_items").insert(
        items.map((i, idx) => ({
          plan_id: newId,
          title: i.title,
          item_type: i.item_type,
          duration_minutes: i.duration_minutes,
          notes: i.notes,
          song_key: i.song_key,
          sort_order: idx,
        })),
      );
      if (itemsError) partial = true;
    }

    if (assignments.length) {
      const { error: assignError } = await supabase.from("plan_assignments").insert(
        assignments.map((a) => ({
          plan_id: newId,
          position: a.position,
          // Keep the position either way; only carry the person if asked.
          profile_id: dupPeople ? a.profile_id : null,
          status: "invited",
        })),
      );
      if (assignError) partial = true;
    }

    if (partial) {
      window.alert(
        "The plan was copied, but some of the order or positions didn't come across. Check the new plan before relying on it.",
      );
    }

    window.location.href = "/services/" + newId;
  }

  async function respond(a: Assignment, status: "accepted" | "declined") {
    const previous = a.status;
    setRespondError(null);
    setAssignments((as) => as.map((x) => (x.id === a.id ? { ...x, status } : x)));
    // Mirror checkOut: `.select` makes the write authoritative — an RLS refusal
    // returns zero rows and a null error, which an unchecked update reads as
    // success. On any failure, put the invitation back the way it was.
    const { data, error } = await supabase
      .from("plan_assignments")
      .update({ status })
      .eq("id", a.id)
      .select("id");
    if (error || !data?.length) {
      setAssignments((as) => as.map((x) => (x.id === a.id ? { ...x, status: previous } : x)));
      setRespondError("Couldn't save your response — try again.");
    }
  }

  const twoCol = "mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <a href="/services" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← All plans
      </a>

      {/* Header: title, date beside it, plan-level actions on the right. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl font-bold text-ink-900">{plan.title}</h1>
          <p className="text-sm text-ink-500">
            {planDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="ah-input w-auto"
              value={dupDate}
              onChange={(e) => setDupDate(e.target.value)}
              aria-label="Duplicate to date"
            />
            <label
              className="flex items-center gap-1.5 text-xs text-ink-500"
              title="Copied people are re-invited — they still need to accept"
            >
              <input
                type="checkbox"
                checked={dupPeople}
                onChange={(e) => setDupPeople(e.target.checked)}
              />
              Keep people
            </label>
            <button
              onClick={duplicate}
              disabled={!dupDate || duplicating}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-50"
            >
              {duplicating ? "Copying…" : "Duplicate"}
            </button>
          </div>
        )}
      </div>

      {/* Stat strip */}
      <div className="mt-6 grid divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StatCell
          kicker="Run time"
          number={totalMin + "m"}
          status={items.length ? items.length + (items.length === 1 ? " item" : " items") + " in the order" : "no items yet"}
        />
        <StatCell
          kicker="Positions"
          number={filled + "/" + assignments.length}
          status={
            assignments.length === 0
              ? "no positions yet"
              : unfilled > 0
                ? unfilled + " unfilled"
                : "every position filled"
          }
          attention={unfilled > 0}
        />
        <StatCell
          kicker="Confirmed"
          number={acceptedCount + "/" + (filled || 0)}
          status={
            pendingCount > 0
              ? pendingCount + " awaiting reply"
              : declinedCount > 0
                ? declinedCount + " declined — re-cover"
                : filled > 0
                  ? "all confirmed"
                  : "nobody assigned yet"
          }
          attention={pendingCount > 0 || declinedCount > 0}
        />
      </div>

      {/* Tab row */}
      <div className="mt-6 flex gap-5 border-b border-ink-100" role="tablist">
        {(
          [
            ["order", "Order of service"],
            ["teams", "Teams"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "-mb-px border-b-2 border-accent pb-2 text-sm font-semibold text-brand-700"
                : "-mb-px border-b-2 border-transparent pb-2 text-sm font-medium text-ink-500 hover:text-ink-700"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---------------- Order of service ---------------- */}
      {tab === "order" && (
        <div className={canManage ? twoCol : "mt-6"}>
          <section>
            <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-ink-100">
                    <th className="w-16 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      Time
                    </th>
                    <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      Item
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      Length
                    </th>
                    {canManage && (
                      <th className="w-10 px-3 py-2">
                        <span className="sr-only">Remove</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {items.map((i, idx) => (
                    <tr key={i.id}>
                      <td className="w-16 px-3 py-2 align-top text-xs font-medium tabular-nums text-ink-500">
                        {clockAt(startTimes[idx] ?? 0)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-ink-800">{i.title}</span>
                          {i.item_type === "song" && i.song_key && (
                            <span className="rounded bg-brand-50 px-1.5 text-[11px] font-medium text-brand-700">
                              {i.song_key}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] uppercase tracking-wide text-ink-400">{i.item_type}</p>
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-ink-500">
                        {i.duration_minutes != null ? i.duration_minutes + "m" : "—"}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeItem(i.id)}
                            className="-m-3.5 p-3.5 text-ink-400 hover:text-brand-600"
                            aria-label="Remove item"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-ink-400">No items yet.</p>
              )}
            </div>
            {removeItemError && (
              <p className="mt-2 text-xs font-medium text-brand-700">{removeItemError}</p>
            )}
          </section>

          {canManage && (
            <aside>
              <form onSubmit={addItem} className="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Add to the order
                </p>
                {itType === "song" && songs.length > 0 ? (
                  <select
                    className="ah-input"
                    value={itSong}
                    onChange={(e) => {
                      setItSong(e.target.value);
                      const s = songs.find((x) => x.id === e.target.value);
                      if (s) setItTitle(s.title);
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
                  <input
                    className="ah-input"
                    placeholder="Item (e.g. Great Are You Lord)"
                    value={itTitle}
                    onChange={(e) => setItTitle(e.target.value)}
                  />
                )}
                <div className="flex gap-2">
                  <select
                    className="ah-input capitalize"
                    value={itType}
                    onChange={(e) => setItType(e.target.value as Item["item_type"])}
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t} value={t} className="capitalize">
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    className="ah-input w-20"
                    placeholder="min"
                    value={itDur}
                    onChange={(e) => setItDur(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={addingItem}
                    className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
                  >
                    {addingItem ? "Adding…" : "Add"}
                  </button>
                </div>
                {itemError && (
                  <p className="text-xs font-medium text-brand-700">{itemError}</p>
                )}
              </form>
            </aside>
          )}
        </div>
      )}

      {/* ---------------- Teams ---------------- */}
      {tab === "teams" && (
        <div className={canManage ? twoCol : "mt-6"}>
          <section>
            <div className="rounded-xl border border-ink-100 bg-white">
              <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
                <p className="text-sm font-semibold text-ink-900">
                  {departmentName ?? "Serving team"}
                </p>
                <p className="text-xs text-ink-500">
                  {acceptedCount}/{assignments.length} confirmed
                </p>
              </div>
              <ul className="divide-y divide-ink-100">
                {assignments.map((a) => {
                  const mine = a.profile_id === currentProfileId;
                  const avail = a.profile_id ? availLabel(a.profile_id) : null;
                  return (
                    <li key={a.id} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink-800">{a.position}</p>
                          {a.assignee && (
                            <p className="text-xs text-ink-500">{a.assignee.full_name}</p>
                          )}
                        </div>
                        {a.profile_id ? (
                          a.status === "accepted" ? (
                            <span className="flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
                              <Icon name="check" size={12} /> Confirmed
                            </span>
                          ) : a.status === "declined" ? (
                            <span className="rounded border border-ink-200 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
                              Declined
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-ink-400">Pending</span>
                          )
                        ) : canManage ? (
                          <button
                            onClick={() => setPickerFor(pickerFor === a.id ? null : a.id)}
                            className="rounded-lg border border-dashed border-ink-200 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          >
                            Find someone
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-ink-400">Unfilled</span>
                        )}
                        {canManage && (
                          <button
                            onClick={() => removePosition(a.id)}
                            className="-m-3.5 shrink-0 p-3.5 text-ink-400 hover:text-brand-600"
                            aria-label="Remove"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        )}
                      </div>
                      {avail && (
                        <p className={"mt-1 flex items-center gap-1 text-xs " + avail.tone}>
                          <Icon name="help" size={12} /> {avail.text}
                        </p>
                      )}
                      {canManage && pickerFor === a.id && !a.profile_id && (
                        <div className="mt-2 flex gap-2">
                          <select
                            className="ah-input"
                            defaultValue=""
                            autoFocus
                            onChange={(e) => {
                              if (e.target.value) assignPerson(a, e.target.value);
                            }}
                          >
                            <option value="">Choose a person…</option>
                            {people.map((p) => {
                              const pl = availLabel(p.id);
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.full_name}
                                  {pl ? " · " + pl.text : ""}
                                </option>
                              );
                            })}
                          </select>
                          <button
                            type="button"
                            onClick={() => setPickerFor(null)}
                            className="shrink-0 rounded-lg bg-ink-100 px-2.5 text-sm font-medium text-ink-600 hover:bg-ink-200"
                            aria-label="Cancel"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                      )}
                      {mine && a.status === "invited" && (
                        <div className="mt-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => respond(a, "accepted")}
                              className="flex-1 rounded-lg bg-accent py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => respond(a, "declined")}
                              className="flex-1 rounded-lg bg-ink-100 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-200"
                            >
                              Decline
                            </button>
                          </div>
                          {respondError && (
                            <p className="mt-2 text-xs font-medium text-brand-700">{respondError}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {assignments.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-ink-400">No positions yet.</p>
              )}
            </div>
            {removePositionError && (
              <p className="mt-2 text-xs font-medium text-brand-700">{removePositionError}</p>
            )}
          </section>

          {canManage && (
            <aside>
              <form onSubmit={addPosition} className="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Add a position
                </p>
                <input
                  className="ah-input"
                  placeholder="Position (e.g. Acoustic Guitar)"
                  value={posName}
                  onChange={(e) => setPosName(e.target.value)}
                />
                <div className="flex gap-2">
                  <select className="ah-input" value={posPerson} onChange={(e) => setPosPerson(e.target.value)}>
                    <option value="">Assign later</option>
                    {people.map((p) => {
                      const a = availLabel(p.id);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                          {a ? " · " + a.text : ""}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="submit"
                    disabled={addingPos}
                    className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
                  >
                    {addingPos ? "Adding…" : "Add"}
                  </button>
                </div>
                {posError && (
                  <p className="text-xs font-medium text-brand-700">{posError}</p>
                )}
              </form>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({
  kicker,
  number,
  status,
  attention = false,
}: {
  kicker: string;
  number: string;
  status: string;
  attention?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{kicker}</p>
      <p className="font-display text-[26px] font-semibold leading-tight text-ink-900">{number}</p>
      <p className={"truncate text-xs " + (attention ? "text-brand-700" : "text-ink-500")}>{status}</p>
    </div>
  );
}
