import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CheckinSettingsAdmin,
  type AutoCheckoutRule,
  type RoomRatio,
} from "@/components/admin/CheckinSettingsAdmin";

export default async function CheckinSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  // Super_Admin only — these settings decide whether a child can be handed over
  // without anyone being named, and when the roster closes itself.
  if ((profile as { role?: string } | null)?.role !== "Super_Admin") {
    redirect("/dashboard");
  }

  const [{ data: settings }, { data: rules }, { data: campuses }, { data: rooms }, { data: lapsed }] =
    await Promise.all([
    supabase
      .from("checkin_settings")
      .select("require_pickup_verification, auto_checkout_enabled, require_current_clearance")
      .maybeSingle(),
    supabase
      .from("checkin_auto_checkout_rules")
      .select("id, day_of_week, at_time, active, label")
      .order("day_of_week")
      .order("at_time"),
    supabase.from("campuses").select("name, timezone").order("name"),
    supabase
      .from("rooms")
      .select("id, name, min_age, max_age, capacity, max_children_per_adult, active")
      .order("name"),
    // Who would lose access the moment enforcement is switched on. Only people
    // who actually work check-in — a lapsed check on someone who never goes
    // near the desk is not a reason to hesitate.
    //
    // Via people_directory: 0049 revoked background_check_expires on profiles,
    // and a column privilege applies to WHERE as well as to the select list, so
    // filtering on it there is refused too.
    supabase
      .from("people_directory")
      .select("id")
      .in("role", ["Staff", "Volunteer"])
      .not("background_check_expires", "is", null)
      .lt("background_check_expires", new Date().toISOString().slice(0, 10)),
    ]);

  return (
    <CheckinSettingsAdmin
      requirePickup={
        (settings as { require_pickup_verification?: boolean } | null)
          ?.require_pickup_verification ?? true
      }
      autoCheckoutEnabled={
        (settings as { auto_checkout_enabled?: boolean } | null)?.auto_checkout_enabled ?? true
      }
      requireClearance={
        (settings as { require_current_clearance?: boolean } | null)?.require_current_clearance ?? false
      }
      lapsedCount={(lapsed ?? []).length}
      rules={(rules ?? []) as AutoCheckoutRule[]}
      rooms={(rooms ?? []) as RoomRatio[]}
      campuses={(campuses ?? []) as { name: string; timezone: string | null }[]}
    />
  );
}
