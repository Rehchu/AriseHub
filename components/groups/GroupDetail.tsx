"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface Member {
  id: string;
  profile_id: string;
  role: "leader" | "assistant" | "member";
  full_name: string;
}
export interface Meeting {
  id: string;
  title: string | null;
  meets_at: string;
  notes: string | null;
}
interface Group {
  id: string;
  name: string;
  description: string | null;
  group_type: string;
  meeting_schedule: string | null;
  is_open: boolean;
}

export function GroupDetail({
  group,
  roster,
  meetings,
  currentProfileId,
  canManage,
}: {
  group: Group;
  roster: Member[];
  meetings: Meeting[];
  currentProfileId: string;
  canManage: boolean;
}) {
  const supabase = createClient();
  const [members, setMembers] = useState<Member[]>(roster);
  const [mtgs, setMtgs] = useState<Meeting[]>(meetings);
  const [adding, setAdding] = useState(false);
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [attendMeeting, setAttendMeeting] = useState<Meeting | null>(null);

  async function loadPeople() {
    if (people.length) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .is("archived_at", null)
      .order("full_name")
      .limit(200);
    setPeople((data ?? []) as { id: string; full_name: string }[]);
  }

  async function addMember(pid: string, name: string) {
    if (members.some((m) => m.profile_id === pid)) return;
    const { data } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, profile_id: pid, role: "member" })
      .select("id")
      .single();
    if (data)
      setMembers((ms) => [
        ...ms,
        { id: (data as { id: string }).id, profile_id: pid, role: "member", full_name: name },
      ]);
  }

  async function removeMember(m: Member) {
    setMembers((ms) => ms.filter((x) => x.id !== m.id));
    await supabase.from("group_members").delete().eq("id", m.id);
  }

  async function setRole(m: Member, role: Member["role"]) {
    setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, role } : x)));
    await supabase.from("group_members").update({ role }).eq("id", m.id);
  }

  async function addMeeting() {
    const { data } = await supabase
      .from("group_meetings")
      .insert({ group_id: group.id, title: "Meeting", meets_at: new Date().toISOString() })
      .select("id, title, meets_at, notes")
      .single();
    if (data) setMtgs((ms) => [data as Meeting, ...ms]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <a href="/groups" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← All groups
      </a>
      <h1 className="font-display text-2xl font-bold text-ink-900">{group.name}</h1>
      <p className="mt-1 text-ink-500">
        {group.group_type.replace("_", " ")}
        {group.meeting_schedule && ` · ${group.meeting_schedule}`}
      </p>
      {group.description && <p className="mt-2 text-ink-600">{group.description}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Roster */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Members ({members.length})
            </h2>
            {canManage && (
              <button
                onClick={() => {
                  loadPeople();
                  setAdding((a) => !a);
                }}
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                + Add
              </button>
            )}
          </div>

          {adding && canManage && (
            <select
              className="ah-input mb-2"
              onChange={(e) => {
                const p = people.find((x) => x.id === e.target.value);
                if (p) addMember(p.id, p.full_name);
                e.target.value = "";
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Add a person…
              </option>
              {people
                .filter((p) => !members.some((m) => m.profile_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
            </select>
          )}

          <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 border-b border-ink-100 px-3 py-2 last:border-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                  {m.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="flex-1 truncate text-sm text-ink-800">{m.full_name}</span>
                {canManage ? (
                  <select
                    value={m.role}
                    onChange={(e) => setRole(m, e.target.value as Member["role"])}
                    className="ah-input w-auto py-1 text-xs"
                  >
                    <option value="leader">Leader</option>
                    <option value="assistant">Assistant</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span className="text-xs capitalize text-ink-400">{m.role}</span>
                )}
                {canManage && (
                  <button onClick={() => removeMember(m)} className="text-ink-300 hover:text-brand-500" aria-label="Remove">
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            ))}
            {members.length === 0 && <p className="px-3 py-4 text-sm text-ink-400">No members yet.</p>}
          </div>
        </section>

        {/* Meetings */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Meetings</h2>
            {canManage && (
              <button onClick={addMeeting} className="text-sm font-medium text-brand-600 hover:underline">
                + New meeting
              </button>
            )}
          </div>
          <div className="space-y-2">
            {mtgs.map((mt) => (
              <button
                key={mt.id}
                onClick={() => canManage && setAttendMeeting(mt)}
                className={`block w-full rounded-xl border border-ink-100 bg-white p-3 text-left ${canManage ? "hover:shadow-md" : ""}`}
              >
                <p className="font-medium text-ink-800">
                  {new Date(mt.meets_at).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                {canManage && <p className="text-xs text-brand-600">Take attendance →</p>}
              </button>
            ))}
            {mtgs.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
                No meetings recorded.
              </p>
            )}
          </div>
        </section>
      </div>

      {attendMeeting && (
        <Attendance
          meeting={attendMeeting}
          members={members}
          onClose={() => setAttendMeeting(null)}
        />
      )}
    </div>
  );
}

function Attendance({
  meeting,
  members,
  onClose,
}: {
  meeting: Meeting;
  members: Member[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("group_attendance")
      .select("profile_id, present")
      .eq("meeting_id", meeting.id)
      .then(({ data }) => {
        const s = new Set<string>();
        for (const r of (data ?? []) as { profile_id: string; present: boolean }[]) {
          if (r.present) s.add(r.profile_id);
        }
        setPresent(s);
        setLoaded(true);
      });
  }, [supabase, meeting.id]);

  async function toggle(profileId: string) {
    const isPresent = !present.has(profileId);
    setPresent((s) => {
      const n = new Set(s);
      isPresent ? n.add(profileId) : n.delete(profileId);
      return n;
    });
    // Upsert the attendance row for this meeting+person.
    await supabase
      .from("group_attendance")
      .upsert(
        { meeting_id: meeting.id, profile_id: profileId, present: isPresent },
        { onConflict: "meeting_id,profile_id" },
      );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <div>
            <h2 className="font-display font-bold">Attendance</h2>
            <p className="text-xs text-ink-400">
              {new Date(meeting.meets_at).toLocaleDateString()} · {present.size} present
            </p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {!loaded && <p className="px-3 py-2 text-sm text-ink-400">Loading…</p>}
          {loaded &&
            members.map((m) => {
              const on = present.has(m.profile_id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.profile_id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-50"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      on ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-300 text-transparent"
                    }`}
                  >
                    <Icon name="check" size={14} />
                  </span>
                  <span className="text-sm text-ink-800">{m.full_name}</span>
                </button>
              );
            })}
          {loaded && members.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-400">No members to check in.</p>
          )}
        </div>
      </div>
    </div>
  );
}
