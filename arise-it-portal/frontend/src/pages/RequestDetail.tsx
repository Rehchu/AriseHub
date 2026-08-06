import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import { timeAgo, initials } from "../lib/format";
import type { Ticket, TicketComment, User } from "../lib/types";

function isOverdue(t: Ticket) {
  return !!t.dueAt && new Date(t.dueAt).getTime() < Date.now() && t.status !== "resolved" && t.status !== "closed";
}

const priorityBadge: Record<string, string> = {
  urgent: "bg-brand-100 text-brand-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [commentBody, setCommentBody] = useState("");

  const canTriage = user?.role === "super_admin" || user?.role === "campus_admin";

  async function load() {
    const r = await api.get<{ ticket: Ticket; comments: TicketComment[] }>(`/api/tickets/${id}`);
    setTicket(r.ticket);
    setComments(r.comments);
  }

  useEffect(() => {
    load();
    if (user?.role === "super_admin") {
      api.get<{ users: User[] }>("/api/users").then((r) => setUsers(r.users));
    }
  }, [id]);

  if (!ticket) return <div className="text-gray-500">Loading…</div>;

  async function updateField(field: string, value: unknown) {
    try {
      await api.put(`/api/tickets/${id}`, { [field]: value });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function assignToMe() {
    try {
      await api.post(`/api/tickets/${id}/assign`, {});
      load();
      toast.success("Assigned to you.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await api.post(`/api/tickets/${id}/comments`, { body: commentBody });
      setCommentBody("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
    }
  }

  const assignee = users.find((u) => u.id === ticket.assignedToUserId);

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={() => navigate("/requests")} className="text-sm text-gray-500 hover:underline">
        ← Back to Requests
      </button>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-display font-bold">{ticket.subject}</h1>
            <div className="text-xs text-gray-400 mt-1">
              #{ticket.id} · {ticket.category} · opened {timeAgo(ticket.createdAt)} by {ticket.requesterName}
              {ticket.isGuest && (
                <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-ink-700 text-gray-500 dark:text-gray-300">Guest</span>
              )}
            </div>
            {ticket.requesterEmail && (
              <div className="text-xs text-gray-400 mt-0.5">
                Follow up:{" "}
                <a href={`mailto:${ticket.requesterEmail}`} className="text-brand-600 hover:underline">
                  {ticket.requesterEmail}
                </a>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOverdue(ticket) && (
              <span className="text-xs font-semibold uppercase px-2 py-1 rounded bg-brand-600 text-white">Overdue</span>
            )}
            <span className={`text-xs font-semibold uppercase px-2 py-1 rounded ${priorityBadge[ticket.priority]}`}>{ticket.priority}</span>
          </div>
        </div>
        {ticket.description && <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.description}</p>}
        {ticket.dueAt && (
          <div className="text-xs text-gray-400">Due {new Date(ticket.dueAt).toLocaleString()}</div>
        )}
      </div>

      {canTriage && (
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={ticket.status}
              onChange={(e) => updateField("status", e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priority</label>
            <select
              value={ticket.priority}
              onChange={(e) => updateField("priority", e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Assigned To</label>
            {user?.role === "super_admin" ? (
              <select
                value={ticket.assignedToUserId ?? ""}
                onChange={(e) => updateField("assignedToUserId", e.target.value ? Number(e.target.value) : null)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm">{assignee?.name ?? "Unassigned"}</span>
                <button onClick={assignToMe} className="text-xs text-brand-600 hover:underline">
                  Assign to me
                </button>
              </div>
            )}
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={ticket.dueAt ? new Date(ticket.dueAt).toISOString().slice(0, 16) : ""}
              onChange={(e) => updateField("dueAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-sm">Activity</h2>
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-ink-800 text-white text-[10px] flex items-center justify-center font-medium shrink-0">
                {initials(c.userName)}
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm flex-1">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span className="font-medium text-gray-600">{c.userName}</span>
                  <span>{timeAgo(c.createdAt)}</span>
                </div>
                {c.body}
              </div>
            </div>
          ))}
          {comments.length === 0 && <div className="text-sm text-gray-400">No activity yet.</div>}
        </div>
        <form onSubmit={submitComment} className="flex gap-2">
          <input
            placeholder="Add a comment…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
