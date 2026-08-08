"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  group_type: string;
  meeting_schedule: string | null;
  is_open: boolean;
  memberCount: number;
  isMember: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  small_group: "Small group",
  ministry: "Ministry",
  class: "Class",
  other: "Group",
};

export function GroupsList({
  initial,
  currentProfileId,
}: {
  initial: GroupRow[];
  currentProfileId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>(initial);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("small_group");
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(q.toLowerCase()),
  );

  async function join(g: GroupRow) {
    setGroups((gs) =>
      gs.map((x) => (x.id === g.id ? { ...x, isMember: true, memberCount: x.memberCount + 1 } : x)),
    );
    await supabase
      .from("group_members")
      .insert({ group_id: g.id, profile_id: currentProfileId, role: "member" });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("groups")
      .insert({
        name: name.trim(),
        group_type: type,
        meeting_schedule: schedule.trim() || null,
        created_by: currentProfileId,
      })
      .select("id")
      .single();
    if (!error && data) {
      // Creator becomes the leader.
      await supabase.from("group_members").insert({
        group_id: (data as { id: string }).id,
        profile_id: currentProfileId,
        role: "leader",
      });
      router.push(`/groups/${(data as { id: string }).id}`);
      return;
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Groups</h1>
          <p className="mt-1 text-ink-500">Small groups, ministries, and classes.</p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
        >
          <Icon name="group" size={18} /> New group
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="mb-6 space-y-3 rounded-xl border border-ink-100 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="ah-input sm:col-span-1" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} required />
            <select className="ah-input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="small_group">Small group</option>
              <option value="ministry">Ministry</option>
              <option value="class">Class</option>
              <option value="other">Other</option>
            </select>
            <input className="ah-input" placeholder="Meets (e.g. Wed 6:30pm)" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </div>
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60">
            {busy ? "Creating…" : "Create group"}
          </button>
        </form>
      )}

      <input className="ah-input mb-4 max-w-xs" placeholder="Search groups…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((g) => (
          <div key={g.id} className="flex flex-col rounded-xl border border-ink-100 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                {TYPE_LABEL[g.group_type] ?? "Group"}
              </span>
              {/* brand-700 on brand-50, not brand-600: the tint pair is what the
                  scale inverts together (7.55:1 light, 7.30:1 dark). brand-600 is
                  tuned to sit on a CARD, and on the tint it fell to 4.36:1 in
                  dark — under AA for 10px uppercase text. */}
              {g.isMember && (
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
                  Member
                </span>
              )}
            </div>
            <Link href={`/groups/${g.id}`} className="mt-2 font-display font-semibold text-ink-900 hover:text-brand-600">
              {g.name}
            </Link>
            {g.meeting_schedule && <p className="text-xs text-ink-400">{g.meeting_schedule}</p>}
            <p className="mt-1 text-xs text-ink-500">
              {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex gap-2">
              <Link href={`/groups/${g.id}`} className="flex-1 rounded-lg bg-ink-50 py-1.5 text-center text-sm font-medium text-ink-700 hover:bg-ink-100">
                Open
              </Link>
              {!g.isMember && g.is_open && (
                <button onClick={() => join(g)} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-onaccent hover:bg-accent-strong">
                  Join
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
            No groups yet — create the first one.
          </p>
        )}
      </div>
    </div>
  );
}
