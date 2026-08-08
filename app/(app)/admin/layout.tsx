import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Admin</h1>
      <p className="mt-1 text-ink-500">
        Manage departments, people, and access for Arise Church.
      </p>
      {/* Nine tabs in a plain flex row squashed to illegible slivers on a
          phone — which is why Rooms looked like it did not exist. Scroll
          sideways instead of shrinking, and let the row bleed to the screen
          edge so it is obviously scrollable. */}
      <nav className="-mx-4 mt-6 flex gap-2 overflow-x-auto border-b border-ink-100 px-4 sm:mx-0 sm:px-0">
        {(isSuper || isStaff) && <AdminTab href="/admin/rooms" label="Rooms" />}
        {isSuper && (
          <>
            <AdminTab href="/admin/checkin" label="Check-in" />
            <AdminTab href="/admin/audit" label="Audit log" />
            <AdminTab href="/admin/campuses" label="Campuses" />
            <AdminTab href="/admin/departments" label="Departments" />
            <AdminTab href="/admin/people" label="People" />
            <AdminTab href="/admin/fields" label="Custom Fields" />
            <AdminTab href="/admin/care-access" label="Care Access" />
          </>
        )}
        {(isSuper || isIT) && <AdminTab href="/admin/elvanto" label="Elvanto" />}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function AdminTab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="shrink-0 whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50"
    >
      {label}
    </Link>
  );
}
