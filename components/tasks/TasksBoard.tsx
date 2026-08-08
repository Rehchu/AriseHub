"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Department } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";
import { Modal } from "@/components/ui/Modal";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "done";
  priority: "low" | "normal" | "high";
  assigned_department_id: string | null;
  assigned_profile_id: string | null;
  created_by: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  dept: { name: string } | null;
  assignee: { full_name: string } | null;
  creator: { full_name: string } | null;
}

type Target =
  | { kind: "self" }
  | { kind: "department"; id: string }
  | { kind: "person"; id: string };

export function TasksBoard({
  currentProfileId,
  isSuperAdmin,
  initial,
  departments,
  myDeptIds,
}: {
  currentProfileId: string;
  isSuperAdmin: boolean;
  initial: TaskRow[];
  departments: Pick<Department, "id" | "name">[];
  myDeptIds: string[];
}) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<TaskRow[]>(initial);
  const [showNew, setShowNew] = useState(false);

  const mine = useMemo(
    () => tasks.filter((t) => t.assigned_profile_id === currentProfileId),
    [tasks, currentProfileId],
  );
  const deptTasks = useMemo(
    () => tasks.filter((t) => t.assigned_department_id),
    [tasks],
  );

  async function setStatus(id: string, status: TaskRow["status"]) {
    const completed_at = status === "done" ? new Date().toISOString() : null;
    setTasks((ts) =>
      ts.map((t) => (t.id === id ? { ...t, status, completed_at } : t)),
    );
    await supabase.from("tasks").update({ status, completed_at }).eq("id", id);
  }

  function addLocal(t: TaskRow) {
    setTasks((ts) => [t, ...ts]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Tasks</h1>
          <p className="mt-1 text-ink-500">
            Assignments and things you&apos;ve logged for the record.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
        >
          <Icon name="task" size={18} /> New task
        </button>
      </div>

      <Section title="Assigned to me" empty="Nothing assigned to you right now.">
        {mine.map((t) => (
          <TaskCard key={t.id} t={t} onStatus={setStatus} />
        ))}
      </Section>

      <Section title="Department tasks" empty="No department tasks yet.">
        {deptTasks.map((t) => (
          <TaskCard key={t.id} t={t} onStatus={setStatus} />
        ))}
      </Section>

      {showNew && (
        <NewTask
          currentProfileId={currentProfileId}
          isSuperAdmin={isSuperAdmin}
          departments={departments}
          myDeptIds={myDeptIds}
          onClose={() => setShowNew(false)}
          onCreated={addLocal}
        />
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const has = arr.some(Boolean) && arr.flat().length > 0;
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
        {title}
      </h2>
      {has ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400">
          {empty}
        </p>
      )}
    </div>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  high: "#d2303b",
  normal: "#6d6e76",
  low: "#9a9ba1",
};

function TaskCard({
  t,
  onStatus,
}: {
  t: TaskRow;
  onStatus: (id: string, s: TaskRow["status"]) => void;
}) {
  const done = t.status === "done";
  const target = t.dept?.name
    ? `Dept · ${t.dept.name}`
    : t.assignee?.full_name
      ? t.assignee.full_name
      : "—";
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: PRIORITY_COLOR[t.priority] }}
    >
      <button
        onClick={() => onStatus(t.id, done ? "open" : "done")}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
          done
            ? "border-emerald-500 bg-emerald-700 text-onaccent"
            : "border-ink-300 text-transparent hover:border-brand-400"
        }`}
        aria-label={done ? "Mark not done" : "Mark done"}
      >
        <Icon name="check" size={14} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${done ? "text-ink-400 line-through" : "text-ink-900"}`}>
          {t.title}
        </p>
        {t.description && (
          <p className="mt-0.5 text-sm text-ink-500">{t.description}</p>
        )}
        <p className="mt-1 text-xs text-ink-400">
          {target}
          {t.creator?.full_name && ` · logged by ${t.creator.full_name}`}
          {t.due_at && ` · due ${new Date(t.due_at).toLocaleDateString()}`}
        </p>
      </div>
      {t.status !== "done" && (
        <select
          value={t.status}
          onChange={(e) => onStatus(t.id, e.target.value as TaskRow["status"])}
          className="ah-input w-auto py-1 text-xs"
          aria-label="Status"
        >
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      )}
    </div>
  );
}

function NewTask({
  currentProfileId,
  isSuperAdmin,
  departments,
  myDeptIds,
  onClose,
  onCreated,
}: {
  currentProfileId: string;
  isSuperAdmin: boolean;
  departments: Pick<Department, "id" | "name">[];
  myDeptIds: string[];
  onClose: () => void;
  onCreated: (t: TaskRow) => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [markDone, setMarkDone] = useState(false);
  const [target, setTarget] = useState<Target>({ kind: "self" });
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Departments a non-admin may log against: their own memberships. Admins: all.
  const assignableDepts = isSuperAdmin
    ? departments
    : departments.filter((d) => myDeptIds.includes(d.id));

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);

    const row: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      created_by: currentProfileId,
      status: markDone ? "done" : "open",
      completed_at: markDone ? new Date().toISOString() : null,
      assigned_department_id: target.kind === "department" ? target.id : null,
      assigned_profile_id:
        target.kind === "self"
          ? currentProfileId
          : target.kind === "person"
            ? target.id
            : null,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(row)
      .select(
        "*, dept:departments(name), assignee:profiles!tasks_assigned_profile_id_fkey(full_name), creator:profiles!tasks_created_by_fkey(full_name)",
      )
      .single();
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("row-level security")
          ? "You don't have permission to assign that. You can log tasks for yourself or your own departments; leads can assign to their members."
          : error.message,
      );
      return;
    }
    onCreated(data as TaskRow);
    // Notify the assignee (if it's someone else) via Web Push — fire-and-forget.
    if (target.kind === "person" && target.id !== currentProfileId) {
      fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: target.id,
          title: "New task assigned",
          body: title.trim(),
          url: "/tasks",
        }),
      }).catch(() => {});
    }
    onClose();
  }

  return (
    <Modal onClose={onClose} align="start" className="p-4 pt-16" label="New task">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">New task</h2>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>

        <input
          className="ah-input"
          placeholder="What needs doing? (e.g. Fixed livestream sound in booth)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
        <textarea
          className="ah-input min-h-20"
          placeholder="Details (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <span className="mb-1 block text-sm font-medium text-ink-600">Who's it for?</span>
          <div className="flex flex-wrap gap-2">
            <TargetChip active={target.kind === "self"} onClick={() => setTarget({ kind: "self" })}>
              Log for myself
            </TargetChip>
            <TargetChip
              active={target.kind === "department"}
              onClick={() =>
                setTarget({ kind: "department", id: assignableDepts[0]?.id ?? "" })
              }
              disabled={assignableDepts.length === 0}
            >
              A department
            </TargetChip>
            <TargetChip
              active={target.kind === "person"}
              onClick={() => {
                loadPeople();
                setTarget({ kind: "person", id: "" });
              }}
            >
              A person
            </TargetChip>
          </div>
        </div>

        {target.kind === "department" && (
          <select
            className="ah-input"
            value={target.id}
            onChange={(e) => setTarget({ kind: "department", id: e.target.value })}
          >
            {assignableDepts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {target.kind === "person" && (
          <select
            className="ah-input"
            value={target.id}
            onChange={(e) => setTarget({ kind: "person", id: e.target.value })}
          >
            <option value="">Choose a person…</option>
            {people
              .filter((p) => p.id !== currentProfileId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
        )}

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-600">
            Priority
            <select
              className="ah-input w-auto py-1.5"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={markDone}
              onChange={(e) => setMarkDone(e.target.checked)}
            />
            Already done (log it)
          </label>
        </div>

        {error && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || (target.kind === "person" && !target.id)}
          className="w-full rounded-lg bg-accent py-2.5 font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save task"}
        </button>
      </form>
    </Modal>
  );
}

function TargetChip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1 text-sm transition ${
        active
          ? "bg-accent text-onaccent"
          : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
