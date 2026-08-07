import { createClient } from "@/lib/supabase/server";
import { ProfileEditor, type MyProfile } from "@/components/account/ProfileEditor";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Your own row, straight from profiles — the privacy view redacts other
  // people, not you.
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, photo_url, bio, birthday, address, emergency_contact, emergency_phone, role, title, campus_id",
    )
    .eq("user_id", user!.id)
    .single();

  const p = profile as (MyProfile & { campus_id: string | null }) | null;
  if (!p) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center text-ink-500">
        We couldn&apos;t find your profile. Ask an admin to check your account.
      </div>
    );
  }

  const [{ data: campus }, { data: memberships }] = await Promise.all([
    p.campus_id
      ? supabase.from("campuses").select("name").eq("id", p.campus_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("department_members")
      .select("departments(name)")
      .eq("profile_id", p.id),
  ]);

  const departments = ((memberships ?? []) as Array<{
    departments: { name: string } | { name: string }[] | null;
  }>)
    .map((m) => (Array.isArray(m.departments) ? m.departments[0]?.name : m.departments?.name))
    .filter((n): n is string => !!n);

  return (
    <ProfileEditor
      profile={{
        ...p,
        campus: (campus as { name: string } | null)?.name ?? null,
        departments,
      }}
    />
  );
}
