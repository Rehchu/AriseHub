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

  /** Group currently being joined, so its button can't be pressed twice. */
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(g: GroupRow) {
    // The optimistic update hides the Join button (it's gated on !isMember), so
    // a rejected insert left someone believing they had joined with no way to
    // retry — and they turn up on Wednesday to a leader whose roster is missing
    // them. Revert and say so.
    if (joining) return;
    setJoining(g.id);
    setError(null);
    setGroups((gs) =>
      gs.map((x) => (x.id === g.id ? { ...x, isMember: true, memberCount: x.memberCount + 1 } : x)),
    );
    const { error: joinError } = await supabase
      .from("group_members")
      .insert({ group_id: g.id, profile_id: currentProfileId, role: "member" });
    setJoining(null);
    if (joinError) {
      setGroups((gs) =>
        gs.map((x) =>
          x.id === g.id ? { ...x, isMember: false, memberCount: Math.max(0, x.memberCount - 1) } : x,
        ),
      );
      setError(`Couldn't join ${g.name} — ${joinError.message}`);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: createError } = await supabase
      .from("groups")
      .insert({
        name: name.trim(),
        group_type: type,
        meeting_schedule: schedule.trim() || null,
        created_by: currentProfileId,
      })
      .select("id")
      .single();
    if (createError || !data) {
      // The button just flipped back from "Creating…" and said nothing, so you
      // assumed a typo and tried again.
      setBusy(false);
      setError(createError?.message ?? "Couldn't create that group — try again.");
      return;
    }
    // Creator becomes the leader. If THIS fails you land in a group you just
    // made with no "+ Add" and no explanation, because canManage is false.
    const { error: leaderError } = await supabase.from("group_members").insert({
      group_id: (data as { id: string }).id,
      profile_id: currentProfileId,
      role: "leader",
    });
    if (leaderError) {
      setBusy(false);
      setError(
        `Group created, but you couldn't be set as its leader (${leaderError.message}). Ask an admin to add you.`,
      );
      return;
    }
    router.push(`/groups/${(data as { id: string }).id}`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-5 border-b border-ink-100 pb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-2xl font-bold text-ink-900">Groups</h1>
            <p className="text-sm text-ink-500">Small groups, ministries, and classes.</p>
          </div>
          <button
            onClick={() => setCreating((c) => !c)}
            className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-strong"
          >
            <Icon name="group" size={18} /> New group
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
        )}
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
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                {TYPE_LABEL[g.group_type] ?? "Group"}
              </span>
              {/* brand-700 on brand-50, not brand-600: the tint pair is what the
                  scale inverts together (7.55:1 light, 7.30:1 dark). brand-600 is
                  tuned to sit on a CARD, and on the tint it fell to 4.36:1 in
                  dark — under AA for small text. */}
              {g.isMember && (
                <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
                  Member
                </span>
              )}
              <span className="ml-auto rounded bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
              </span>
            </div>
            <Link href={`/groups/${g.id}`} className="mt-2 truncate font-display font-semibold text-ink-900 hover:text-brand-600">
              {g.name}
            </Link>
            {g.meeting_schedule && <p className="mt-0.5 text-xs text-ink-500">{g.meeting_schedule}</p>}
            <div className="mt-auto flex gap-2 pt-3">
              <Link href={`/groups/${g.id}`} className="flex-1 rounded-lg bg-ink-50 py-1.5 text-center text-sm font-medium text-ink-700 hover:bg-ink-100">
                Open
              </Link>
              {!g.isMember && g.is_open && (
                <button
                  onClick={() => join(g)}
                  disabled={joining === g.id}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-onaccent hover:bg-accent-strong disabled:opacity-60"
                >
                  {joining === g.id ? "Joining…" : "Join"}
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

      {groups.length > 0 && (
        <div className="mt-6 grid divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat kicker="Groups" value={String(groups.length)} note="across the church" />
          <Stat
            kicker="You're in"
            value={String(groups.filter((g) => g.isMember).length)}
            note={
              groups.some((g) => g.isMember)
                ? "see you there"
                : "join one below"
            }
            attention={!groups.some((g) => g.isMember)}
          />
          <Stat
            kicker="Open to join"
            value={String(groups.filter((g) => g.is_open).length)}
            note="accepting new members"
          />
        </div>
      )}
    </div>
  );
}

/** One cell of the bottom stat strip — kicker, 26px number, 12px status. */
function Stat({
  kicker,
  value,
  note,
  attention = false,
}: {
  kicker: string;
  value: string;
  note: string;
  attention?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{kicker}</p>
      <p className="mt-0.5 font-display text-[26px] font-bold leading-8 text-ink-900">{value}</p>
      <p className={`truncate text-xs ${attention ? "text-brand-700" : "text-ink-500"}`}>{note}</p>
    </div>
  );
}
