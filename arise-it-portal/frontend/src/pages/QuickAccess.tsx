import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../lib/api";
import PublicShell from "../components/PublicShell";

export default function QuickAccess() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/guest/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { scope?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "That code isn't valid");
      navigate(data.scope === "wifi" ? "/go/wifi" : "/go/equipment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-display font-bold">Enter Access Code</h1>
          <p className="text-sm text-gray-500">Type the code your IT admin gave you. No account needed.</p>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            autoFocus
            placeholder="ABC-123-XYZ"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full border rounded-lg px-3 py-3 text-center font-mono text-lg tracking-widest uppercase"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Continue"}
          </button>
        </form>
        <div className="text-center text-xs text-gray-400 pt-2">
          Need to report a problem instead?{" "}
          <Link to="/request" className="text-brand-600 hover:underline">
            Submit a request
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
