import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../lib/api";
import PublicShell from "../components/PublicShell";

interface PublicCampus {
  id: number;
  name: string;
}

export default function PublicRequest() {
  const [campuses, setCampuses] = useState<PublicCampus[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    requesterName: "",
    requesterEmail: "",
    campusId: "",
    category: "other",
    priority: "medium",
    subject: "",
    description: "",
    website: "", // honeypot
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/public/campuses`)
      .then((r) => r.json())
      .then((d: { campuses: PublicCampus[] }) => setCampuses(d.campuses))
      .catch(() => setCampuses([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, campusId: Number(form.campusId) }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <PublicShell>
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto">
            ✓
          </div>
          <h1 className="text-xl font-display font-bold">Request submitted</h1>
          <p className="text-sm text-gray-500">
            Thanks, {form.requesterName.split(" ")[0] || "there"}! Our IT team has it and will follow up
            {form.requesterEmail ? ` at ${form.requesterEmail}` : ""}.
          </p>
          <button
            onClick={() => {
              setForm({ ...form, subject: "", description: "" });
              setSubmitted(false);
            }}
            className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            Submit another request
          </button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-display font-bold">Submit an IT Request</h1>
          <p className="text-sm text-gray-500">No account needed — just tell us what you need help with.</p>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Honeypot: hidden from humans, catches naive bots. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="hidden"
            aria-hidden="true"
          />
          <div>
            <label className="block text-sm font-medium mb-1">Your name *</label>
            <input
              required
              value={form.requesterName}
              onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email (optional, for follow-up)</label>
            <input
              type="email"
              value={form.requesterEmail}
              onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Campus *</label>
              <select
                required
                value={form.campusId}
                onChange={(e) => setForm({ ...form, campusId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="hardware">Hardware / equipment</option>
                <option value="software">Software</option>
                <option value="network">Network / WiFi</option>
                <option value="account">Account / login</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">How urgent?</label>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="low">Low — whenever you can</option>
              <option value="medium">Medium — this week</option>
              <option value="high">High — needed soon</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">What's the issue? *</label>
            <input
              required
              placeholder="e.g. Projector in the sanctuary won't turn on"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">More details (optional)</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        </form>
        <div className="text-center text-xs text-gray-400 pt-2">
          Have an access code?{" "}
          <Link to="/go" className="text-brand-600 hover:underline">
            Enter it here
          </Link>{" "}
          · IT staff?{" "}
          <Link to="/login" className="text-brand-600 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
