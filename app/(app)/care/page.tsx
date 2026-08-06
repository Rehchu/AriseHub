import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CareBoard, type CareItem } from "@/components/care/CareBoard";

export default async function CarePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();

  const role = (profile as { role?: string } | null)?.role;
  // Belt-and-suspenders with the RLS: keep non-pastoral roles out of the page.
  if (role !== "Super_Admin" && role !== "Staff") redirect("/dashboard");

  const profileId = (profile as { id: string }).id;

  const [{ data: items }, { data: people }] = await Promise.all([
    supabase
      .from("care_items")
      .select(
        "id, title, about_name, about_profile_id, category, stage, priority, assigned_to, notes, due_at, assignee:profiles!care_items_assigned_to_fkey(full_name)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").is("archived_at", null).order("full_name").limit(300),
  ]);

  // The embedded join returns `assignee` as an array; flatten to a single object.
  const normalized: CareItem[] = ((items ?? []) as unknown as Array<
    Omit<CareItem, "assignee"> & { assignee: { full_name: string }[] | { full_name: string } | null }
  >).map((i) => ({
    ...i,
    assignee: Array.isArray(i.assignee) ? (i.assignee[0] ?? null) : i.assignee,
  }));

  return (
    <CareBoard
      initial={normalized}
      people={(people ?? []) as { id: string; full_name: string }[]}
      currentProfileId={profileId}
    />
  );
}
