import { createClient } from "@/lib/supabase/server";
import { CalendarView, type EventRow, type RoomOpt, type EventType } from "@/components/calendar/CalendarView";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const profileId = (profile as { id: string } | null)?.id ?? "";
  const role = (profile as { role?: string } | null)?.role;
  const canApprove = role === "Super_Admin" || role === "Staff";

  // Upcoming window: from the start of today forward.
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const [{ data: events }, { data: rooms }, { data: types }] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, description, event_type_id, room_id, starts_at, ends_at, all_day, featured, setup_minutes, teardown_minutes, status, is_public, requested_by, room:rooms(name), type:event_types(name, color)",
      )
      .gte("ends_at", from.toISOString())
      .order("starts_at"),
    supabase.from("rooms").select("id, name").order("name"),
    supabase.from("event_types").select("id, name, color").order("name"),
  ]);

  const one = <T,>(v: T[] | T | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const normalized: EventRow[] = ((events ?? []) as unknown as Array<
    Omit<EventRow, "room" | "type"> & {
      room: { name: string }[] | { name: string } | null;
      type: { name: string; color: string }[] | { name: string; color: string } | null;
    }
  >).map((e) => ({ ...e, room: one(e.room), type: one(e.type) }));

  return (
    <CalendarView
      initial={normalized}
      rooms={(rooms ?? []) as RoomOpt[]}
      types={(types ?? []) as EventType[]}
      currentProfileId={profileId}
      canApprove={canApprove}
    />
  );
}
