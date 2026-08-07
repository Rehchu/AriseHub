import { createClient } from "@/lib/supabase/server";
import { PeopleDirectory, type DirectoryPerson } from "@/components/people/PeopleDirectory";
import type { Campus, Department } from "@/lib/database.types";

export default async function PeoplePage() {
  const supabase = await createClient();

  const [{ data: profiles, error: dirError }, { data: campuses }, { data: departments }, { data: memberships }] =
    await Promise.all([
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
    ]);

  // Until 0027 is applied the view doesn't exist — fall back to profiles so the
  // directory keeps working (contact details are simply not yet restricted).
  const rows = dirError
    ? (
        await supabase
          .from("profiles")
          .select("id, full_name, email, phone, role, campus_id, photo_url, archived_at")
          .is("archived_at", null)
          .order("full_name")
      ).data
    : profiles;

  const campusName: Record<string, string> = {};
  for (const c of (campuses ?? []) as Campus[]) campusName[c.id] = c.name;
  const deptName: Record<string, string> = {};
  for (const d of (departments ?? []) as Department[]) deptName[d.id] = d.name;

  const deptsByProfile: Record<string, string[]> = {};
  for (const m of (memberships ?? []) as { profile_id: string; department_id: string }[]) {
    (deptsByProfile[m.profile_id] ??= []).push(deptName[m.department_id] ?? "");
  }

  const people: DirectoryPerson[] = ((rows ?? []) as Array<{
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
    campus: p.campus_id ? (campusName[p.campus_id] ?? null) : null,
    departments: (deptsByProfile[p.id] ?? []).filter(Boolean),
  }));

  return (
    <PeopleDirectory
      people={people}
      campuses={(campuses ?? []) as Pick<Campus, "id" | "name">[]}
      departments={(departments ?? []) as Pick<Department, "id" | "name">[]}
    />
  );
}
