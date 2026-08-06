import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/shell/Icon";

// A single reporting surface. Every query runs under the viewer's RLS, so a
// Staff member only aggregates what they can see; Super_Admin sees church-wide.
export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "Super_Admin" && role !== "Staff") redirect("/dashboard");

  const today = new Date().toISOString().slice(0, 10);
  const n = (r: { count: number | null }) => r.count ?? 0;

  const [
    peopleRows,
    campuses,
    groupsCount,
    groupMembers,
    departmentsCount,
    tasksOpen,
    tasksDone,
    careOpen,
    upcomingPlans,
    submissions,
  ] = await Promise.all([
    supabase.from("profiles").select("role, campus_id, archived_at").is("archived_at", null),
    supabase.from("campuses").select("id, name"),
    supabase.from("groups").select("*", { count: "exact", head: true }),
    supabase.from("group_members").select("*", { count: "exact", head: true }),
    supabase.from("departments").select("*", { count: "exact", head: true }),
    supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "done"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "done"),
    supabase.from("care_items").select("*", { count: "exact", head: true }).neq("stage", "resolved"),
    supabase.from("service_plans").select("*", { count: "exact", head: true }).gte("service_date", today),
    supabase.from("form_submissions").select("*", { count: "exact", head: true }),
  ]);

  const people = (peopleRows.data ?? []) as { role: string; campus_id: string | null }[];
  const byRole: Record<string, number> = {};
  const byCampus: Record<string, number> = {};
  const campusName: Record<string, string> = {};
  for (const c of (campuses.data ?? []) as { id: string; name: string }[]) campusName[c.id] = c.name;
  for (const p of people) {
    byRole[p.role] = (byRole[p.role] ?? 0) + 1;
    const key = p.campus_id ? campusName[p.campus_id] ?? "Unknown" : "No campus";
    byCampus[key] = (byCampus[key] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Reports</h1>
      <p className="mt-1 text-ink-500">A church-wide snapshot across every module.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="users" accent="#7c3aed" label="People" value={people.length} />
        <Stat icon="group" accent="#059669" label="Groups" value={n(groupsCount)} sub={`${n(groupMembers)} memberships`} />
        <Stat icon="task" accent="#0891b2" label="Open tasks" value={n(tasksOpen)} sub={`${n(tasksDone)} done`} />
        <Stat icon="heart" accent="#be123c" label="Open care items" value={n(careOpen)} />
        <Stat icon="music" accent="#db2777" label="Upcoming plans" value={n(upcomingPlans)} />
        <Stat icon="form" accent="#0d9488" label="Form submissions" value={n(submissions)} />
        <Stat icon="group" accent="#4b5563" label="Departments" value={n(departmentsCount)} />
        <Stat icon="home" accent="#d2303b" label="Campuses" value={(campuses.data ?? []).length} />
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Breakdown title="People by role" data={byRole} />
        <Breakdown title="People by campus" data={byCampus} />
      </div>
    </div>
  );
}

function Stat({
  icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: string;
  accent: string;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4">
      <span
        className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: accent }}
      >
        <Icon name={icon} size={18} />
      </span>
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      <p className="text-sm text-ink-500">{label}</p>
      {sub && <p className="text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5">
      <h2 className="mb-3 font-display font-semibold text-ink-900">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-400">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="mb-0.5 flex justify-between text-sm">
                <span className="text-ink-600">{k.replace("_", " ")}</span>
                <span className="font-medium text-ink-800">{v}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
