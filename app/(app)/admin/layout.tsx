import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminTabs } from "@/components/admin/AdminTabs";

// Admin area — Super_Admin only. RLS also enforces this server-side on every
// write, but we gate the whole section here so non-admins never see it.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
  const isSuper = role === "Super_Admin";
  const isIT = role === "IT_Admin";
  const isStaff = role === "Staff";
  // Each page below carries its own guard, so the layout only decides who may
  // see the section at all: admins, IT (integrations), and Staff (rooms).
  if (!isSuper && !isIT && !isStaff) redirect("/dashboard");

  const tabs: { href: string; label: string }[] = [];
  if (isSuper || isStaff) tabs.push({ href: "/admin/rooms", label: "Rooms" });
  if (isSuper) {
    tabs.push(
      { href: "/admin/checkin", label: "Check-in" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/campuses", label: "Campuses" },
      { href: "/admin/departments", label: "Departments" },
      { href: "/admin/people", label: "People" },
      { href: "/admin/titles", label: "Titles" },
      { href: "/admin/fields", label: "Custom Fields" },
    );
  }
  if (isSuper || isIT) tabs.push({ href: "/admin/elvanto", label: "Elvanto" });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-2xl font-bold text-ink-900">Admin</h1>
        <p className="text-sm text-ink-500">
          Departments, people, and access for Arise Church.
        </p>
      </div>
      <AdminTabs tabs={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
