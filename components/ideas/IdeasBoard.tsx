"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface Idea {
  id: string;
  title: string;
  detail: string | null;
  category: "idea" | "improvement" | "problem";
  status: "open" | "planned" | "in_progress" | "done" | "declined";
  admin_note: string | null;
  submitted_by: string | null;
  author: string;
  created_at: string;
  votes: number;
  voted: boolean;
}

const CATEGORY_LABEL: Record<Idea["category"], string> = {
  idea: "New idea",
  improvement: "Improvement",
  problem: "Something's wrong",
};
// Token pairs only: a problem report is the one category that asks for
// attention (brand tint); the other two are quiet. The label does the rest.
const CATEGORY_STYLE: Record<Idea["category"], string> = {
  idea: "bg-ink-100 text-ink-600",
  improvement: "bg-ink-100 text-ink-600",
  problem: "bg-brand-50 text-brand-700",
};
const STATUS_LABEL: Record<Idea["status"], string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "Being built",
  done: "Done",
  declined: "Not planned",
};
// Active commitments read brand; resolved states go quiet (their rows also
// fade and sink to the bottom of the list).
const STATUS_STYLE: Record<Idea["status"], string> = {
  open: "bg-ink-100 text-ink-600",
  planned: "bg-brand-50 text-brand-700",
  in_progress: "bg-brand-50 text-brand-700",
  done: "border border-ink-200 text-ink-500",
  declined: "bg-ink-100 text-ink-400",
};

/**
 * Feature requests from the people who actually use the app.
 *
 * Voting matters here: without it the loudest voice wins, and the quiet
 * volunteer who spotted the real problem gets drowned out.
 */
export function IdeasBoard({
  initial,
  currentProfileId,
  canManage,
}: {
  initial: Idea[];
  currentProfileId: string;
  canManage: boolean;
}) {
  const supabase = createClient();
  const [ideas, setIdeas] = useState<Idea[]>(initial);
  const [filter, setFilter] = useState<"all" | Idea["status"]>("all");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState<Idea["category"]>("idea");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const list = filter === "all" ? ideas : ideas.filter((i) => i.status === filter);
    // Open items sorted by votes; resolved ones drop to the bottom.
    const rank = (s: Idea["status"]) => (s === "done" || s === "declined" ? 1 : 0);
    return [...list].sort((a, b) => rank(a.status) - rank(b.status) || b.votes - a.votes);
  }, [ideas, filter]);

  // Strip numbers come from rows already on the client — no extra query.
  const openCount = ideas.filter((i) => i.status === "open").length;
  const inMotionCount = ideas.filter(
    (i) => i.status === "planned" || i.status === "in_progress",
  ).length;
  const shippedCount = ideas.filter((i) => i.status === "done").length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("feature_requests")
      .insert({
        title: title.trim(),
        detail: detail.trim() || null,
        category,
        submitted_by: currentProfileId,
      })
      .select("id, title, detail, category, status, admin_note, submitted_by, created_at")
      .single();
    setBusy(false);
    if (error) return setError(error.message);

    setIdeas((list) => [
      { ...(data as Omit<Idea, "author" | "votes" | "voted">), author: "You", votes: 0, voted: false },
      ...list,
    ]);
    setTitle("");
    setDetail("");
    setCategory("idea");
    setAdding(false);
  }

  async function toggleVote(i: Idea) {
    const voting = !i.voted;
    setIdeas((list) =>
      list.map((x) =>
        x.id === i.id ? { ...x, voted: voting, votes: x.votes + (voting ? 1 : -1) } : x,
      ),
    );
    if (voting) {
      await supabase.from("feature_votes").insert({ request_id: i.id, profile_id: currentProfileId });
    } else {
      await supabase
        .from("feature_votes")
        .delete()
        .eq("request_id", i.id)
        .eq("profile_id", currentProfileId);
    }
  }

  // Both writes are authoritative. RLS refusing a row is NOT an error — it
  // returns zero rows and a null error, which an unchecked call cannot tell
  // from success. An IT_Admin (whom the policy excludes) confirmed a delete,
  // watched the card vanish, and found it back on the board next load, still
  // there for everyone.
  const [writeError, setWriteError] = useState<string | null>(null);

  async function setStatus(i: Idea, status: Idea["status"]) {
    const previous = i.status;
    setWriteError(null);
    setIdeas((list) => list.map((x) => (x.id === i.id ? { ...x, status } : x)));
    const { data, error } = await supabase
      .from("feature_requests")
      .update({ status })
      .eq("id", i.id)
      .select("id");
    if (error || !data?.length) {
      setIdeas((list) => list.map((x) => (x.id === i.id ? { ...x, status: previous } : x)));
      setWriteError(error?.message ?? "You don't have permission to change that idea's status.");
    }
  }

  async function remove(i: Idea) {
    if (!window.confirm(`Delete "${i.title}"?`)) return;
    setWriteError(null);
    const { data, error } = await supabase
      .from("feature_requests")
      .delete()
      .eq("id", i.id)
      .select("id");
    if (error || !data?.length) {
      setWriteError(error?.message ?? "You don't have permission to delete that idea.");
      return;
    }
    // Removed only once the delete is confirmed.
    setIdeas((list) => list.filter((x) => x.id !== i.id));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-5 border-b border-ink-100 pb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-bold text-ink-900">Ideas &amp; requests</h1>
            <p className="text-sm text-ink-500">
              Something missing or annoying? Say so — and vote for what matters most.
            </p>
          </div>
          <button
            onClick={() => setAdding((a) => !a)}
            className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-strong"
          >
            <Icon name="chart" size={18} /> Suggest something
          </button>
        </div>
        {writeError && (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {writeError}
          </p>
        )}
      </div>

      {adding && (
        <form onSubmit={submit} className="mb-5 space-y-3 rounded-xl border border-ink-100 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CATEGORY_LABEL) as Idea["category"][]).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  category === c ? "bg-accent text-onaccent" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input
            className="ah-input"
            placeholder="What would help? (one sentence)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
          <textarea
            className="ah-input min-h-24"
            placeholder="Any detail — when it happens, who it affects, what you'd expect instead"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Sending…" : "Submit"}
          </button>
        </form>
      )}

      <div className="mb-5 grid divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StatCell
          kicker="Open"
          value={openCount}
          note={canManage ? "awaiting triage" : "gathering votes"}
          attention={canManage && openCount > 0}
        />
        <StatCell kicker="In motion" value={inMotionCount} note="planned or being built" />
        <StatCell kicker="Shipped" value={shippedCount} note="done and delivered" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", "open", "planned", "in_progress", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              filter === f ? "bg-ink-900 text-onaccent" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
          Nothing here yet — be the first to suggest something.
        </p>
      ) : (
        <div className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
          {shown.map((i) => (
            <div
              key={i.id}
              className={`flex gap-3 px-3 py-2.5 ${
                i.status === "done" || i.status === "declined" ? "opacity-70" : ""
              }`}
            >
              <button
                onClick={() => toggleVote(i)}
                className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border transition ${
                  i.voted
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-ink-200 text-ink-500 hover:border-brand-400"
                }`}
                aria-label={i.voted ? "Remove vote" : "Vote"}
              >
                <span className="text-[10px] leading-none">▲</span>
                <span className="text-sm font-bold leading-tight">{i.votes}</span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${CATEGORY_STYLE[i.category]}`}>
                    {CATEGORY_LABEL[i.category]}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[i.status]}`}>
                    {STATUS_LABEL[i.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-ink-900">{i.title}</p>
                {i.detail && <p className="mt-0.5 text-sm text-ink-600">{i.detail}</p>}
                {i.admin_note && (
                  <p className="mt-1.5 rounded-lg bg-ink-50 px-2 py-1 text-xs text-ink-600">
                    <strong>Note:</strong> {i.admin_note}
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-400">
                  {i.author} · {new Date(i.created_at).toLocaleDateString()}
                </p>

                {canManage && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={i.status}
                      onChange={(e) => setStatus(i, e.target.value as Idea["status"])}
                      className="ah-input w-auto py-1 text-xs"
                    >
                      {(Object.keys(STATUS_LABEL) as Idea["status"][]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => remove(i)}
                      className="-my-3.5 -ml-2 -mr-3.5 shrink-0 p-3.5 text-ink-400 hover:text-brand-600"
                      aria-label="Delete"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({
  kicker,
  value,
  note,
  attention = false,
}: {
  kicker: string;
  value: number;
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
