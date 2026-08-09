import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvitePanel } from "@/components/admin/InvitePanel";
import type { Campus, Department } from "@/lib/database.types";

/**
 * Invite people.
 *
 * Lives outside /admin because department heads need it and /admin is
 * Super_Admin-only. A lead sees only the departments they lead and can invite
 * at Member or Volunteer; a Super_Admin sees everything. Both limits are
 * enforced by RLS (0018) — this page just avoids offering options that would
 * be rejected.
 */
export default async function InvitePage() {
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
  if (!me) redirect("/dashboard");

  const isSuper = me.role === "Super_Admin";

  // Departments this person leads — the only ones they may invite into.
  const { data: leadRows } = await supabase
    .from("department_members")
    .select("department_id")
    .eq("profile_id", me.id)
    .eq("role", "lead");
  const leadIds = ((leadRows ?? []) as { department_id: string }[]).map((r) => r.department_id);

  if (!isSuper && leadIds.length === 0) redirect("/dashboard");

  const [{ data: departments }, { data: campuses }] = await Promise.all([
    supabase.from("departments").select("id, name, slug").order("name"),
    supabase.from("campuses").select("id, name").order("name"),
  ]);

  const allDepartments = (departments ?? []) as Department[];
  const visible = isSuper
    ? allDepartments
    : allDepartments.filter((d) => leadIds.includes(d.id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ink-100 pb-4">
        <h1 className="font-display text-2xl font-bold text-ink-900">Invite people</h1>
        <p className="text-sm text-ink-500">
          {isSuper
            ? "create a link, share it, and people register themselves"
            : "create a link for your department — people register themselves"}
        </p>
      </div>
      <InvitePanel
        departments={visible}
        campuses={(campuses ?? []) as Campus[]}
        createdBy={me.id}
        isSuperAdmin={isSuper}
        defaultOpen
      />
    </div>
  );
}
