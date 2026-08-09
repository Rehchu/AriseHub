"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campus } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

export interface RoomRow {
  id: string;
  name: string;
  campus_id: string | null;
  capacity: number | null;
  min_age: number | null;
  max_age: number | null;
  active: boolean;
}

/**
 * Rooms & classrooms.
 *
 * Rooms do double duty: check-in uses the age range to auto-assign a child to
 * the right classroom, and the calendar uses them for bookings (with the
 * double-booking guard). Both were reading rooms that had no screen to create
 * them — this is that screen.
 */
export function RoomsAdmin({
  initial,
  campuses,
}: {
  initial: RoomRow[];
  campuses: Pick<Campus, "id" | "name">[];
}) {
  const supabase = createClient();
  const [rooms, setRooms] = useState<RoomRow[]>(initial);
  const [name, setName] = useState("");
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!campusId) {
      setError("Add a campus first — every room belongs to one.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        name: name.trim(),
        campus_id: campusId,
        min_age: minAge === "" ? null : Number(minAge),
        max_age: maxAge === "" ? null : Number(maxAge),
        capacity: capacity === "" ? null : Number(capacity),
        active: true,
      })
      .select("id, name, campus_id, capacity, min_age, max_age, active")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setRooms((r) => [...r, data as RoomRow].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    setMinAge("");
    setMaxAge("");
    setCapacity("");
  }

  async function patch(id: string, fields: Partial<RoomRow>) {
    setError(null);
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    const { error } = await supabase.from("rooms").update(fields).eq("id", id);
    if (error) setError(error.message);
  }

  async function remove(r: RoomRow) {
    if (
      !window.confirm(
        `Delete "${r.name}"? Past check-ins keep their record, but the room disappears from check-in and the calendar.\n\nIf you just want to stop using it, untick Active instead.`,
      )
    )
      return;
    setRooms((rs) => rs.filter((x) => x.id !== r.id));
    const { error } = await supabase.from("rooms").delete().eq("id", r.id);
    if (error) {
      setError(error.message);
      setRooms((rs) => [...rs, r].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  const campusName = (id: string | null) =>
    campuses.find((c) => c.id === id)?.name ?? "No campus";

  return (
    <div>
      <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
        Rooms are used two ways: check-in puts a child in the right classroom
        based on their <strong>age range</strong>, and the calendar books them for
        events (refusing double-bookings). Leave the ages blank for a room that
        isn&apos;t a classroom.
      </p>

      {campuses.length === 0 && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Add a campus first — every room belongs to one.
        </p>
      )}

      <form onSubmit={add} className="mb-6 space-y-3 rounded-xl border border-ink-100 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">Room name</span>
            <input
              className="ah-input"
              placeholder="e.g. Nursery, Sanctuary, Youth Room"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">Campus</span>
            <select className="ah-input" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* Three number fields side by side leaves ~95px each on a phone, and
            iOS pins form controls to 16px. Two up, three from sm. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Min age</span>
            <input type="number" min={0} className="ah-input" placeholder="—" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Max age</span>
            <input type="number" min={0} className="ah-input" placeholder="—" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Capacity</span>
            <input type="number" min={1} className="ah-input" placeholder="—" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || campuses.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add room"}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      {rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
          No rooms yet. Add your classrooms above so check-in can assign children
          to them.
        </p>
      ) : (
      <div className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
        {rooms.map((r) => (
          <div key={r.id} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <input
                  className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-ink-900 outline-none focus:ring-0"
                  value={r.name}
                  onChange={(e) => patch(r.id, { name: e.target.value })}
                />
                <p className="text-xs text-ink-400">
                  {campusName(r.campus_id)}
                  {r.min_age != null || r.max_age != null
                    ? ` · ages ${r.min_age ?? 0}–${r.max_age ?? "+"}`
                    : " · not age-restricted"}
                  {r.capacity != null && ` · holds ${r.capacity}`}
                </p>
              </div>
              {!r.active && (
                <span className="rounded bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                  off
                </span>
              )}
              <label className="flex items-center gap-1.5 text-xs text-ink-600">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => patch(r.id, { active: e.target.checked })}
                />
                Active
              </label>
              <button onClick={() => remove(r)} className="text-ink-400 hover:text-brand-600" aria-label="Delete room">
                <Icon name="trash" size={16} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-ink-100 pt-2 sm:grid-cols-4">
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-ink-400">Min age</span>
                <input
                  type="number"
                  min={0}
                  className="ah-input py-1 text-sm"
                  value={r.min_age ?? ""}
                  onChange={(e) => patch(r.id, { min_age: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-ink-400">Max age</span>
                <input
                  type="number"
                  min={0}
                  className="ah-input py-1 text-sm"
                  value={r.max_age ?? ""}
                  onChange={(e) => patch(r.id, { max_age: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-ink-400">Capacity</span>
                <input
                  type="number"
                  min={1}
                  className="ah-input py-1 text-sm"
                  value={r.capacity ?? ""}
                  onChange={(e) => patch(r.id, { capacity: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
