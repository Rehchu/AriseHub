import { createClient } from "@/lib/supabase/server";
import {
  PeopleDirectory,
  type DirectoryPerson,
  type DirectoryStats,
} from "@/components/people/PeopleDirectory";
import type { Campus, Department } from "@/lib/database.types";

export default async function PeoplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [
    { data: profiles, error: dirError },
    { data: campuses },
    { data: departments },
    { data: memberships, error: memError },
    { count: newCount, error: newError },
    { data: me },
    { data: leadsSomething },
  ] = await Promise.all([
    // people_directory nulls out email/phone unless the viewer is leadership
    // or it is their own row (migration 0027).
    supabase
      .from("people_directory")
      .select("id, full_name, title, email, phone, role, campus_id, photo_url, archived_at")
      .is("archived_at", null)
      .order("full_name"),
    supabase.from("campuses").select("id, name").order("name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("profile_id, department_id"),
    // Head-only count for the "new this month" stat — filters on created_at
    // without pulling any extra columns onto the page.
    supabase
      .from("people_directory")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .gte("created_at", firstOfMonth),
    // The "Add person" header action goes to /invite, which only Super_Admins
    // and department leads may use (0018) — same gate the Shell nav applies.
    supabase.from("profiles").select("role").eq("user_id", user!.id).single(),
    supabase.rpc("is_any_department_lead"),
  ]);

  const campusName: Record<string, string> = {};
  for (const c of (campuses ?? []) as Campus[]) campusName[c.id] = c.name;
  const deptName: Record<string, string> = {};
  for (const d of (departments ?? []) as Department[]) deptName[d.id] = d.name;

  const memberRows = (memberships ?? []) as { profile_id: string; department_id: string }[];
  const deptsByProfile: Record<string, string[]> = {};
  for (const m of memberRows) {
    (deptsByProfile[m.profile_id] ??= []).push(deptName[m.department_id] ?? "");
  }

  const people: DirectoryPerson[] = ((profiles ?? []) as Array<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    role: string;
    title?: string | null;
    campus_id: string | null;
    photo_url: string | null;
  }>).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    role: p.role,
    title: p.title ?? null,
    photo_url: p.photo_url,
    campus: p.campus_id ? (campusName[p.campus_id] ?? null) : null,
    departments: (deptsByProfile[p.id] ?? []).filter(Boolean),
  }));

  // Each stat is null when this viewer's data access cannot answer it —
  // the strip only renders the cells it can stand behind.
  const total = dirError ? null : people.length;
  let serving: DirectoryStats["serving"] = null;
  if (!dirError && !memError && people.length > 0) {
    const servingIds = new Set(memberRows.map((m) => m.profile_id));
    const count = people.filter((p) => servingIds.has(p.id)).length;
    serving = { count, pct: Math.round((count / people.length) * 100) };
  }
  const stats: DirectoryStats = {
    newThisMonth: newError || newCount === null ? null : newCount,
    serving,
    total,
  };

  const canInvite =
    (me as { role: string } | null)?.role === "Super_Admin" || !!leadsSomething;

  return (
    <PeopleDirectory
      people={people}
      campuses={(campuses ?? []) as Pick<Campus, "id" | "name">[]}
      departments={(departments ?? []) as Pick<Department, "id" | "name">[]}
      stats={stats}
      canInvite={canInvite}
    />
  );
}
