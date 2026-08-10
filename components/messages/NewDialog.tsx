"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { Modal } from "@/components/ui/Modal";

interface Person {
  id: string;
  full_name: string;
  role: string;
}

// Two ways to start a 1:1: search everyone in the directory, or browse a
// department's roster (rosters are readable to all — so you can message someone
// in a department you're NOT a member of, even though you can't see its chat).
export function NewDialog({
  currentProfileId,
  onClose,
}: {
  currentProfileId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<"people" | "departments">("people");
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deptId, setDeptId] = useState<string>("");
  const [deptMembers, setDeptMembers] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .is("archived_at", null)
      .order("full_name")
      .limit(200)
      .then(({ data }) => setPeople((data ?? []) as Person[]));
    supabase
      .from("departments")
      .select("id, name")
      .order("name")
      .then(({ data }) => setDepartments((data ?? []) as { id: string; name: string }[]));
  }, [supabase]);

  // Load a department's roster when one is picked.
  useEffect(() => {
    if (!deptId) {
      setDeptMembers([]);
      return;
    }
    supabase
      .from("department_members")
      .select("profile_id, profiles(id, full_name, role)")
      .eq("department_id", deptId)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as {
          profiles: Person | null;
        }[];
        setDeptMembers(rows.map((r) => r.profiles).filter(Boolean) as Person[]);
      });
  }, [supabase, deptId]);

  async function startDm(otherId: string) {
    setBusy(true);
    setDmError(null);
    const { data, error } = await supabase.rpc("get_or_create_dm", {
      other_profile: otherId,
    });
    setBusy(false);
    if (error || !data) {
      setDmError(error?.message ?? "Couldn't open that conversation — try again.");
      return;
    }
    onClose();
    router.push(`/messages/${data}`);
    router.refresh();
  }

  const peopleList = people
    .filter((p) => p.id !== currentProfileId)
    .filter((p) => p.full_name.toLowerCase().includes(q.toLowerCase()));
  const memberList = deptMembers.filter((p) => p.id !== currentProfileId);

  return (
    <Modal onClose={onClose} align="start" className="p-4 pt-20" label="New message">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="font-display font-bold">New message</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>

        <div className="flex gap-1 px-3 pt-3">
          <TabBtn active={tab === "people"} onClick={() => setTab("people")}>
            All people
          </TabBtn>
          <TabBtn active={tab === "departments"} onClick={() => setTab("departments")}>
            By department
          </TabBtn>
        </div>

        {tab === "people" ? (
          <>
            <div className="p-3">
              <input
                autoFocus
                className="ah-input"
                placeholder="Search people…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <PersonList list={peopleList} busy={busy} onPick={startDm} />
          </>
        ) : (
          <>
            <div className="p-3">
              <select
                className="ah-input"
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
              >
                <option value="">Choose a department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {deptId ? (
              <PersonList list={memberList} busy={busy} onPick={startDm} emptyLabel="No members in this department." />
            ) : (
              <p className="px-4 pb-4 text-sm text-ink-400">
                Pick a department to see its members.
              </p>
            )}
          </>
        )}

        {dmError && (
          <p className="mx-3 mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            {dmError}
          </p>
        )}
      </div>
    </Modal>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:bg-ink-50"
      }`}
    >
      {children}
    </button>
  );
}

function PersonList({
  list,
  busy,
  onPick,
  emptyLabel = "No people found.",
}: {
  list: Person[];
  busy: boolean;
  onPick: (id: string) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="max-h-72 overflow-y-auto px-2 pb-3">
      {list.length === 0 && (
        <p className="px-3 py-2 text-sm text-ink-400">{emptyLabel}</p>
      )}
      {list.map((p) => (
        <button
          key={p.id}
          disabled={busy}
          onClick={() => onPick(p.id)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink-50 disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {p.full_name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <span className="flex-1">
            <span className="block font-medium text-ink-800">{p.full_name}</span>
            <span className="block text-xs text-ink-400">{p.role.replace("_", " ")}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
