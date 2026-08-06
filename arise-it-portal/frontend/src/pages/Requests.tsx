import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import StatTile from "../components/StatTile";
import { timeAgo, initials } from "../lib/format";
import type { Campus, Ticket } from "../lib/types";

function isOverdue(t: Ticket) {
  return !!t.dueAt && new Date(t.dueAt).getTime() < Date.now() && t.status !== "resolved" && t.status !== "closed";
}

const priorityBorder: Record<string, string> = {
  urgent: "border-l-brand-500",
  high: "border-l-orange-500",
  medium: "border-l-gold-500",
  low: "border-l-slate-400",
};

const priorityBadge: Record<string, string> = {
  urgent: "bg-brand-100 text-brand-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const statusBadge: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  waiting: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-600",
};

interface DashboardTicketStats {
  tickets: { waitingForMe: number; assignedToMe: number; unassigned: number; dueSoon: number };
}

export default function Requests() {
  const { user } = useAuth();
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [stats, setStats] = useState<DashboardTicketStats["tickets"] | null>(null);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [quickFilter, setQuickFilter] = useState<"" | "mine" | "unassigned">("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", campusId: user?.campusId ? String(user.campusId) : "", category: "other", priority: "medium" });

  const canTriage = user?.role === "super_admin" || user?.role === "campus_admin";

  async function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (quickFilter === "mine") params.set("mine", "1");
    if (quickFilter === "unassigned") params.set("unassigned", "1");
    const r = await api.get<{ tickets: Ticket[] }>(`/api/tickets?${params}`);
    setTickets(r.tickets);
  }

  useEffect(() => {
    load();
  }, [status, priority, quickFilter]);

  useEffect(() => {
    api.get<{ campuses: Campus[] }>("/api/campuses").then((r) => setCampuses(r.campuses));
    api.get<DashboardTicketStats>("/api/dashboard").then((r) => setStats(r.tickets));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/tickets", { ...form, campusId: Number(form.campusId) });
      setForm({ ...form, subject: "", description: "" });
      setShowForm(false);
      load();
      api.get<DashboardTicketStats>("/api/dashboard").then((r) => setStats(r.tickets));
      toast.success("Request submitted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Requests</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
          + New Request
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Waiting for me" value={stats.waitingForMe} color="brand" onClick={() => setQuickFilter("")} />
          <StatTile label="Assigned to me" value={stats.assignedToMe} color="ink" onClick={() => setQuickFilter("mine")} />
          <StatTile label="Unassigned" value={stats.unassigned} color="gold" onClick={() => setQuickFilter("unassigned")} />
          <StatTile label="Due soon" value={stats.dueSoon} color="slate" />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-3">
          <input
            required
            placeholder="What's the issue? (e.g. Projector won't turn on)"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Details (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            rows={3}
          />
          <div className="grid grid-cols-3 gap-2">
            <select required value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Campus</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              <option value="hardware">Hardware</option>
              <option value="software">Software</option>
              <option value="network">Network</option>
              <option value="account">Account</option>
              <option value="other">Other</option>
            </select>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
            Submit Request
          </button>
        </form>
      )}

      <div className="flex gap-2 flex-wrap">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting">Waiting</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {quickFilter && (
          <button onClick={() => setQuickFilter("")} className="text-sm text-brand-600 hover:underline">
            Clear quick filter
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tickets.map((t) => (
          <Link
            key={t.id}
            to={`/requests/${t.id}`}
            className={`bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 border-l-4 ${priorityBorder[t.priority]} hover:shadow-md transition-shadow block`}
          >
            <div className="flex items-center justify-between mb-2 gap-1 flex-wrap">
              <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${priorityBadge[t.priority]}`}>{t.priority}</span>
              <div className="flex items-center gap-1">
                {isOverdue(t) && (
                  <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-brand-600 text-white">Overdue</span>
                )}
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${statusBadge[t.status]}`}>{t.status.replace("_", " ")}</span>
              </div>
            </div>
            <div className="font-semibold text-sm mb-1">{t.subject}</div>
            <div className="text-xs text-gray-400 mb-3">{t.category}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-ink-800 text-white text-[10px] flex items-center justify-center font-medium">
                  {initials(t.requesterName)}
                </div>
                <span className="text-xs text-gray-500">{t.requesterName}</span>
                {t.isGuest && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-ink-700 text-gray-500 dark:text-gray-300">Guest</span>
                )}
              </div>
              <span className="text-xs text-gray-400">{timeAgo(t.createdAt)}</span>
            </div>
          </Link>
        ))}
        {tickets.length === 0 && <div className="text-gray-400 col-span-full text-center py-8">No requests found.</div>}
      </div>
    </div>
  );
}
