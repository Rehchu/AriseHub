"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface RoomOpt {
  id: string;
  name: string;
}
export interface EventType {
  id: string;
  name: string;
  color: string;
}
export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  event_type_id: string | null;
  room_id: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  featured: boolean;
  setup_minutes: number;
  teardown_minutes: number;
  status: "pending" | "approved" | "declined" | "cancelled";
  is_public: boolean;
  requested_by: string | null;
  room: { name: string } | null;
  type: { name: string; color: string } | null;
}

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  declined: "bg-ink-100 text-ink-400",
  cancelled: "bg-ink-100 text-ink-400",
};

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
// "Jul 14 – 18" for multi-day runs (camps/VBS), single date otherwise.
function dateRange(e: EventRow) {
  const s = shortDate(e.starts_at);
  const en = shortDate(e.ends_at);
  return s === en ? `${s}${e.all_day ? "" : ` · ${time(e.starts_at)}`}` : `${s} – ${en}`;
}

function TypeChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active ? "text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
      }`}
      style={active ? { backgroundColor: color } : undefined}
    >
      {children}
    </button>
  );
}

export function CalendarView({
  initial,
  rooms,
  types,
  currentProfileId,
  canApprove,
}: {
  initial: EventRow[];
  rooms: RoomOpt[];
  types: EventType[];
  currentProfileId: string;
  canApprove: boolean;
}) {
  const supabase = createClient();
  const [events, setEvents] = useState<EventRow[]>(initial);
  const [eventTypes, setEventTypes] = useState<EventType[]>(types);
  const [showNew, setShowNew] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => (filterType ? events.filter((e) => e.event_type_id === filterType) : events),
    [events, filterType],
  );

  // Featured/multi-day happenings (camps, VBS, conferences, guest speakers)
  // pinned above the day-by-day list.
  const featured = useMemo(
    () => visible.filter((e) => e.featured && e.status !== "cancelled" && e.status !== "declined"),
    [visible],
  );

  const grouped = useMemo(() => {
    const g: Record<string, EventRow[]> = {};
    for (const e of visible) (g[dayKey(e.starts_at)] ??= []).push(e);
    return g;
  }, [visible]);

  async function setStatus(ev: EventRow, status: EventRow["status"]) {
    setError(null);
    const prev = ev.status;
    setEvents((es) => es.map((x) => (x.id === ev.id ? { ...x, status } : x)));
    const { error } = await supabase
      .from("events")
      .update({ status, approved_by: status === "approved" ? currentProfileId : null })
      .eq("id", ev.id);
    if (error) {
      // Most likely the room-conflict trigger rejected the approval.
      setEvents((es) => es.map((x) => (x.id === ev.id ? { ...x, status: prev } : x)));
      setError(error.message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Calendar</h1>
          <p className="mt-1 text-ink-500">Events & facility booking.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Icon name="calendar" size={18} /> Request event
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      {/* Filter by type */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <TypeChip active={!filterType} onClick={() => setFilterType("")} color="#4b5563">
          All
        </TypeChip>
        {eventTypes.map((t) => (
          <TypeChip key={t.id} active={filterType === t.id} onClick={() => setFilterType(t.id)} color={t.color}>
            {t.name}
          </TypeChip>
        ))}
      </div>

      {/* Upcoming highlights — camps, VBS, conferences, guest speakers */}
      {featured.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Upcoming events
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-ink-100 bg-white p-4"
                style={{ borderTop: `3px solid ${e.type?.color ?? "#d97706"}` }}
              >
                {e.type && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: e.type.color }}
                  >
                    {e.type.name}
                  </span>
                )}
                <p className="font-display font-semibold text-ink-900">{e.title}</p>
                <p className="text-sm text-ink-500">{dateRange(e)}</p>
                {e.description && <p className="mt-1 text-sm text-ink-600">{e.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
          Nothing on the calendar yet.
        </p>
      ) : (
        Object.entries(grouped).map(([day, list]) => (
          <div key={day} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{day}</h2>
            <div className="space-y-2">
              {list.map((e) => (
                <div key={e.id} className="rounded-xl border border-ink-100 bg-white p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {e.type && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                            style={{ backgroundColor: e.type.color }}
                          >
                            {e.type.name}
                          </span>
                        )}
                        <p className="font-medium text-ink-900">{e.title}</p>
                      </div>
                      <p className="text-sm text-ink-500">
                        {e.all_day ? "All day" : `${time(e.starts_at)} – ${time(e.ends_at)}`}
                        {e.room?.name && ` · ${e.room.name}`}
                      </p>
                      {(e.setup_minutes > 0 || e.teardown_minutes > 0) && (
                        <p className="text-xs text-ink-400">
                          +{e.setup_minutes}m setup / +{e.teardown_minutes}m teardown
                        </p>
                      )}
                      {e.description && <p className="mt-1 text-sm text-ink-600">{e.description}</p>}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[e.status]}`}>
                      {e.status}
                    </span>
                  </div>
                  {canApprove && e.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setStatus(e, "approved")} className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-sm font-medium text-white hover:bg-emerald-600">
                        Approve
                      </button>
                      <button onClick={() => setStatus(e, "declined")} className="flex-1 rounded-lg bg-ink-100 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-200">
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showNew && (
        <NewEvent
          rooms={rooms}
          types={eventTypes}
          onTypeCreated={(t) => setEventTypes((ts) => [...ts, t].sort((a, b) => a.name.localeCompare(b.name)))}
          currentProfileId={currentProfileId}
          canApprove={canApprove}
          onClose={() => setShowNew(false)}
          onCreated={(e) => setEvents((es) => [...es, e].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))}
        />
      )}
    </div>
  );
}

function NewEvent({
  rooms,
  types,
  onTypeCreated,
  currentProfileId,
  canApprove,
  onClose,
  onCreated,
}: {
  rooms: RoomOpt[];
  types: EventType[];
  onTypeCreated: (t: EventType) => void;
  currentProfileId: string;
  canApprove: boolean;
  onClose: () => void;
  onCreated: (e: EventRow) => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState("");
  const [newType, setNewType] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [setup, setSetup] = useState("0");
  const [teardown, setTeardown] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staff can invent a new event type on the spot (e.g. "Men's Retreat").
  async function addType() {
    const name = newType.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("event_types")
      .insert({ name })
      .select("id, name, color")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    onTypeCreated(data as EventType);
    setTypeId((data as EventType).id);
    setNewType("");
    setAddingType(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setBusy(true);
    setError(null);
    const lastDay = endDate || date;
    const starts_at = new Date(allDay ? `${date}T00:00` : `${date}T${start}`).toISOString();
    const ends_at = new Date(allDay ? `${lastDay}T23:59` : `${lastDay}T${end}`).toISOString();
    if (ends_at <= starts_at) {
      setError("The end must be after the start.");
      setBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        event_type_id: typeId || null,
        room_id: roomId || null,
        starts_at,
        ends_at,
        all_day: allDay,
        featured,
        setup_minutes: Number(setup) || 0,
        teardown_minutes: Number(teardown) || 0,
        requested_by: currentProfileId,
        // Staff booking directly get an approved event (subject to the conflict
        // trigger); everyone else submits a request for approval.
        status: canApprove ? "approved" : "pending",
      })
      .select("id, title, description, event_type_id, room_id, starts_at, ends_at, all_day, featured, setup_minutes, teardown_minutes, status, is_public, requested_by")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const room = rooms.find((r) => r.id === roomId);
    const t = types.find((x) => x.id === typeId);
    onCreated({
      ...(data as EventRow),
      room: room ? { name: room.name } : null,
      type: t ? { name: t.name, color: t.color } : null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">
            {canApprove ? "New event" : "Request an event"}
          </h2>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>

        <input className="ah-input" placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        <textarea className="ah-input min-h-16" placeholder="Details (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

        {/* Event type — presets + create your own */}
        <div className="text-sm">
          <span className="mb-1 block font-medium text-ink-600">Event type</span>
          {!addingType ? (
            <div className="flex gap-2">
              <select className="ah-input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">No type</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {canApprove && (
                <button type="button" onClick={() => setAddingType(true)} className="shrink-0 rounded-lg bg-ink-100 px-3 text-sm font-medium text-ink-700 hover:bg-ink-200">
                  + New
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="ah-input" placeholder="Custom type (e.g. Men's Retreat)" value={newType} onChange={(e) => setNewType(e.target.value)} autoFocus />
              <button type="button" onClick={addType} className="shrink-0 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white">
                Save
              </button>
              <button type="button" onClick={() => setAddingType(false)} className="shrink-0 text-ink-400">
                <Icon name="x" />
              </button>
            </div>
          )}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-600">Room</span>
          <select className="ah-input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">No room needed</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {rooms.length === 0 && (
            <span className="mt-1 block text-xs text-ink-400">
              No rooms defined yet — add them in Admin later.
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-600">Starts</span>
            <input type="date" className="ah-input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-600">Ends (multi-day)</span>
            <input type="date" className="ah-input" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink-600">Start time</span>
              <input type="time" className="ah-input" value={start} onChange={(e) => setStart(e.target.value)} required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink-600">End time</span>
              <input type="time" className="ah-input" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-ink-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            Feature in “Upcoming events”
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-600">Setup (min)</span>
            <input type="number" min={0} className="ah-input" value={setup} onChange={(e) => setSetup(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-600">Teardown (min)</span>
            <input type="number" min={0} className="ah-input" value={teardown} onChange={(e) => setTeardown(e.target.value)} />
          </label>
        </div>

        {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {busy ? "Saving…" : canApprove ? "Create event" : "Submit request"}
        </button>
      </form>
    </div>
  );
}
