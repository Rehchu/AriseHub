import { createClient } from "@/lib/supabase/server";
import { IdeasBoard, type Idea } from "@/components/ideas/IdeasBoard";

export default async function IdeasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const p = profile as { id: string; role: string } | null;
  const canManage = p?.role === "Super_Admin" || p?.role === "IT_Admin";

  const [{ data: requests }, { data: votes }] = await Promise.all([
    supabase
      .from("feature_requests")
      .select("id, title, detail, category, status, admin_note, submitted_by, created_at, profiles!feature_requests_submitted_by_fkey(full_name)")
      .order("created_at", { ascending: false }),
    supabase.from("feature_votes").select("request_id, profile_id"),
  ]);

  const voteCount: Record<string, number> = {};
  const myVotes = new Set<string>();
  for (const v of (votes ?? []) as { request_id: string; profile_id: string }[]) {
    voteCount[v.request_id] = (voteCount[v.request_id] ?? 0) + 1;
    if (v.profile_id === p?.id) myVotes.add(v.request_id);
  }

  const rows: Idea[] = ((requests ?? []) as unknown as Array<{
    id: string;
    title: string;
    detail: string | null;
    category: string;
    status: string;
    admin_note: string | null;
    submitted_by: string | null;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }>).map((r) => {
    const who = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      title: r.title,
      detail: r.detail,
      category: r.category as Idea["category"],
      status: r.status as Idea["status"],
      admin_note: r.admin_note,
      submitted_by: r.submitted_by,
      author: who?.full_name ?? "Someone",
      created_at: r.created_at,
      votes: voteCount[r.id] ?? 0,
      voted: myVotes.has(r.id),
    };
  });

  return <IdeasBoard initial={rows} currentProfileId={p?.id ?? ""} canManage={canManage} />;
}
