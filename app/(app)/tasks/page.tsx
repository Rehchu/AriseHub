import { createClient } from "@/lib/supabase/server";
import { TasksBoard, type TaskRow } from "@/components/tasks/TasksBoard";
import type { Department } from "@/lib/database.types";

export default async function TasksPage() {
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

  // RLS returns only the tasks this person may see (theirs, their departments',
  // ones they created, or all for Super_Admin).
  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "*, dept:departments(name), assignee:profiles!tasks_assigned_profile_id_fkey(full_name), creator:profiles!tasks_created_by_fkey(full_name)",
    )
    .order("created_at", { ascending: false });

  // Departments the user can log against (their memberships) + all departments
  // for the target picker (RLS enforces who can actually assign).
  const { data: myMemberships } = await supabase
    .from("department_members")
    .select("department_id, role")
    .eq("profile_id", profileId);

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  return (
    <TasksBoard
      currentProfileId={profileId}
      isSuperAdmin={(profile as { role?: string } | null)?.role === "Super_Admin"}
      initial={(tasks ?? []) as TaskRow[]}
      departments={(departments ?? []) as Pick<Department, "id" | "name">[]}
      myDeptIds={((myMemberships ?? []) as { department_id: string }[]).map(
        (m) => m.department_id,
      )}
    />
  );
}
