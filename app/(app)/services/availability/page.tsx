import { createClient } from "@/lib/supabase/server";
import { AvailabilityEditor } from "@/components/services/AvailabilityEditor";
import type { Blockout, ServingPattern } from "@/lib/availability";

export default async function AvailabilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const profileId = (profile as { id: string } | null)?.id ?? "";

  const [{ data: blockouts }, { data: patterns }] = await Promise.all([
    supabase
      .from("blockout_dates")
      .select("id, profile_id, starts_on, ends_on, reason")
      .eq("profile_id", profileId)
      .order("starts_on"),
    supabase
      .from("serving_patterns")
      .select("id, profile_id, weekday, weeks, note")
      .eq("profile_id", profileId),
  ]);

  return (
    <AvailabilityEditor
      profileId={profileId}
      initialBlockouts={(blockouts ?? []) as Blockout[]}
      initialPatterns={(patterns ?? []) as ServingPattern[]}
    />
  );
}
