import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CheckinSettingsAdmin,
  type AutoCheckoutRule,
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

  const [{ data: settings }, { data: rules }, { data: campuses }] = await Promise.all([
    supabase
      .from("checkin_settings")
      .select("require_pickup_verification, auto_checkout_enabled, print_guardian_tag")
      .maybeSingle(),
    supabase
      .from("checkin_auto_checkout_rules")
      .select("id, day_of_week, at_time, active, label")
      .order("day_of_week")
      .order("at_time"),
    supabase.from("campuses").select("name, timezone").order("name"),
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
      printGuardianTag={
        (settings as { print_guardian_tag?: boolean } | null)?.print_guardian_tag ?? false
      }
      rules={(rules ?? []) as AutoCheckoutRule[]}
      campuses={(campuses ?? []) as { name: string; timezone: string | null }[]}
    />
  );
}
