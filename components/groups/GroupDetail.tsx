"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { Modal } from "@/components/ui/Modal";

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
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [addingMeeting, setAddingMeeting] = useState(false);
  const [meetDate, setMeetDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [meetTitle, setMeetTitle] = useState("");

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
    if (!window.confirm(`Remove ${m.full_name} from this group?`)) return;
    const previous = members;
    setRosterError(null);
    setMembers((ms) => ms.filter((x) => x.id !== m.id));
    // `.select` makes the delete authoritative — an RLS refusal returns zero
    // rows and a null error, which an unchecked delete reads as success.
    const { data, error } = await supabase
      .from("group_members")
      .delete()
      .eq("id", m.id)
      .select("id");
    if (error || !data?.length) {
      setMembers(previous);
      setRosterError("Couldn't save — try again");
    }
  }

  async function setRole(m: Member, role: Member["role"]) {
    const previous = m.role;
    setRosterError(null);
    setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, role } : x)));
    const { data, error } = await supabase
      .from("group_members")
      .update({ role })
      .eq("id", m.id)
      .select("id");
    if (error || !data?.length) {
      setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, role: previous } : x)));
      setRosterError("Couldn't save — try again");
    }
  }

  async function addMeeting(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase
      .from("group_meetings")
      .insert({
        group_id: group.id,
        title: meetTitle.trim() || null,
        meets_at: new Date(meetDate + "T12:00:00").toISOString(),
      })
      .select("id, title, meets_at, notes")
      .single();
    if (data) {
      // A leader may record a past meeting, so keep the list newest-first — the
      // "last on" stat and the row order both read mtgs[0] as the latest.
      setMtgs((ms) =>
        [data as Meeting, ...ms].sort((a, b) => b.meets_at.localeCompare(a.meets_at)),
      );
      setMeetTitle("");
      setMeetDate(new Date().toLocaleDateString("en-CA"));
      setAddingMeeting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <a href="/groups" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← All groups
      </a>
      <div className="border-b border-ink-100 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl font-bold text-ink-900">{group.name}</h1>
          <p className="text-sm capitalize text-ink-500">
            {group.group_type.replace("_", " ")}
            {group.meeting_schedule && ` · ${group.meeting_schedule}`}
          </p>
        </div>
        {group.description && <p className="mt-2 text-sm text-ink-600">{group.description}</p>}
      </div>

      <div className="mt-5 grid divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          kicker="Members"
          value={String(members.length)}
          note={
            members.some((m) => m.role === "leader")
              ? `${members.filter((m) => m.role === "leader").length} leader${
                  members.filter((m) => m.role === "leader").length === 1 ? "" : "s"
                }`
              : "no leader yet"
          }
          attention={!members.some((m) => m.role === "leader")}
        />
        <Stat
          kicker="Meetings"
          value={String(mtgs.length)}
          note={
            mtgs.length > 0
              ? `last on ${new Date(mtgs[0].meets_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`
              : "none recorded yet"
          }
        />
        <Stat
          kicker="Enrollment"
          value={group.is_open ? "Open" : "Closed"}
          note={group.is_open ? "anyone can join" : "leaders add members"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Roster */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
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

          {rosterError && (
            <p className="mb-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{rosterError}</p>
          )}

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

          <div className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
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
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] capitalize ${
                      m.role === "leader" ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {m.role}
                  </span>
                )}
                {canManage && (
                  <button
                    onClick={() => removeMember(m)}
                    className="-m-3.5 shrink-0 p-3.5 text-ink-400 hover:text-brand-600"
                    aria-label="Remove"
                  >
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
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Meetings</h2>
            {canManage && (
              <button
                onClick={() => setAddingMeeting((a) => !a)}
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                + New meeting
              </button>
            )}
          </div>
          {addingMeeting && canManage && (
            <form
              onSubmit={addMeeting}
              className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 bg-white p-2"
            >
              <input
                type="date"
                className="ah-input w-auto"
                value={meetDate}
                onChange={(e) => setMeetDate(e.target.value)}
                aria-label="Meeting date"
                required
              />
              <input
                className="ah-input min-w-0 flex-1"
                placeholder="Title (optional)"
                value={meetTitle}
                onChange={(e) => setMeetTitle(e.target.value)}
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
              >
                Add
              </button>
            </form>
          )}
          {mtgs.length > 0 ? (
            <div className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
              {mtgs.map((mt) => (
                <button
                  key={mt.id}
                  onClick={() => canManage && setAttendMeeting(mt)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${canManage ? "transition hover:bg-ink-50" : "cursor-default"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-800">
                      {new Date(mt.meets_at).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {mt.title && (
                      <span className="block truncate text-xs text-ink-500">{mt.title}</span>
                    )}
                  </span>
                  {canManage && <span className="shrink-0 text-xs text-brand-600">Take attendance →</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
              No meetings recorded.
            </p>
          )}
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

/** One cell of the header stat strip — kicker, 26px number, 12px status. */
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
  const [saveError, setSaveError] = useState<string | null>(null);

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
    const previous = present;
    setSaveError(null);
    setPresent((s) => {
      const n = new Set(s);
      isPresent ? n.add(profileId) : n.delete(profileId);
      return n;
    });
    // Upsert the attendance row for this meeting+person. `.select()` makes the
    // write authoritative — an RLS refusal returns zero rows and a null error,
    // which an unchecked upsert reads as success. On flaky wifi a failed save
    // must not leave a tick that isn't really recorded, so roll back and say so.
    const { data, error } = await supabase
      .from("group_attendance")
      .upsert(
        { meeting_id: meeting.id, profile_id: profileId, present: isPresent },
        { onConflict: "meeting_id,profile_id" },
      )
      .select();
    if (error || !data?.length) {
      setPresent(previous);
      setSaveError("Couldn't save — try again");
    }
  }

  return (
    <Modal onClose={onClose} align="start" className="p-4 pt-16" label="Attendance">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <div>
            <h2 className="font-display font-bold">Attendance</h2>
            <p className="text-xs text-ink-400">
              {new Date(meeting.meets_at).toLocaleDateString()} · {present.size} present
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>
        {saveError && (
          <p className="mx-2 mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{saveError}</p>
        )}
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
                      // ink-400, not ink-300. This box IS the control and its
                      // border is the only thing on screen when unticked —
                      // ink-300 measured 2.76:1 in light and 2.10:1 in dark,
                      // under the 3:1 a control boundary needs. Taking
                      // attendance in dark mode you saw green boxes next to the
                      // people already marked and nothing at all next to
                      // everyone else. ink-300 stays for hairline dividers.
                      on
                        ? "border-emerald-500 bg-emerald-700 text-onaccent"
                        : "border-ink-400 text-transparent"
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
    </Modal>
  );
}
