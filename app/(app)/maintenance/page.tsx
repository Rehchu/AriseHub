import { createClient } from "@/lib/supabase/server";
import {
  MaintenanceBoard,
  type MaintenanceRequest,
} from "@/components/maintenance/MaintenanceBoard";

export const metadata = { title: "Maintenance" };

// Anyone may report; RLS decides what comes back. The maintenance team and
// staff see every request, everyone else sees only their own — so the page is
// safe for the whole church without a role gate here.
export default async function MaintenancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const me = profile as { id: string; role: string } | null;

  const { data: member } = await supabase
    .from("department_members")
    .select("id, departments!inner(slug)")
    .eq("profile_id", me?.id ?? "")
    .in("departments.slug", ["maintenance-janitorial", "maintenance"])
    .maybeSingle();
  const isTeam =
    !!member || me?.role === "Super_Admin" || me?.role === "Staff";

  const [{ data: rows }, { data: deptRow }] = await Promise.all([
    supabase
      .from("maintenance_requests")
      .select(
        "id, title, location, details, photo_key, urgent, status, reported_by, reported_for, assigned_to, resolution, created_at, reporter:profiles!maintenance_requests_reported_by_fkey(full_name), owner:profiles!maintenance_requests_assigned_to_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("departments")
      .select("id")
      .in("slug", ["maintenance-janitorial", "maintenance"])
      .maybeSingle(),
  ]);

  // Who a request can be assigned to: the maintenance department itself.
  let team: { id: string; full_name: string }[] = [];
  const deptId = (deptRow as { id: string } | null)?.id;
  if (isTeam && deptId) {
    const { data: members } = await supabase
      .from("department_members")
      .select("profile_id, profiles(full_name)")
      .eq("department_id", deptId);
    team = ((members ?? []) as unknown as {
      profile_id: string;
      profiles: { full_name: string } | null;
    }[])
      .filter((m) => m.profiles)
      .map((m) => ({ id: m.profile_id, full_name: m.profiles!.full_name }));
  }

  return (
    <MaintenanceBoard
      rows={(rows ?? []) as unknown as MaintenanceRequest[]}
      team={team}
      isTeam={isTeam}
      currentProfileId={me?.id ?? ""}
    />
  );
}
