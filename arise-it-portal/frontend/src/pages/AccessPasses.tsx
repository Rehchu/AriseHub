import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { timeAgo } from "../lib/format";
import type { AccessPass, Campus } from "../lib/types";

interface NewCode {
  label: string;
  code: string;
  scope: "equipment" | "wifi";
  campusName: string;
}

export default function AccessPasses() {
  const toast = useToast();
  const [passes, setPasses] = useState<AccessPass[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [form, setForm] = useState({ label: "", scope: "equipment", campusId: "", wifiAllNetworks: false });
  const [newCode, setNewCode] = useState<NewCode | null>(null);
  const [requestPosterCampus, setRequestPosterCampus] = useState("");

  async function load() {
    const r = await api.get<{ passes: AccessPass[] }>("/api/access-passes");
    setPasses(r.passes);
  }

  useEffect(() => {
    load();
    api.get<{ campuses: Campus[] }>("/api/campuses").then((r) => setCampuses(r.campuses));
  }, []);

  function campusName(id: number) {
    return campuses.find((c) => c.id === id)?.name ?? id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { pass, code } = await api.post<{ pass: AccessPass; code: string }>("/api/access-passes", {
        label: form.label,
        scope: form.scope,
        campusId: Number(form.campusId),
        wifiAllNetworks: form.scope === "wifi" ? form.wifiAllNetworks : false,
      });
      setNewCode({ label: pass.label, code, scope: pass.scope, campusName: campusName(pass.campusId) as string });
      setForm({ label: "", scope: "equipment", campusId: "", wifiAllNetworks: false });
      load();
      toast.success("Access code created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create code");
    }
  }

  async function rotate(p: AccessPass) {
    if (!confirm(`Generate a new code for "${p.label}"? The current code will stop working.`)) return;
    try {
      const { code } = await api.post<{ code: string }>(`/api/access-passes/${p.id}/rotate`);
      setNewCode({ label: p.label, code, scope: p.scope, campusName: campusName(p.campusId) as string });
      load();
      toast.success("New code generated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rotate code");
    }
  }

  async function downloadPoster(c: NewCode) {
    try {
      const { generateAccessPoster } = await import("../lib/poster");
      await generateAccessPoster({
        label: c.label,
        code: c.code,
        scope: c.scope,
        campusName: c.campusName,
        baseUrl: window.location.origin,
      });
    } catch {
      toast.error("Failed to generate poster");
    }
  }

  async function downloadRequestPoster() {
    try {
      const { generateRequestPoster } = await import("../lib/poster");
      await generateRequestPoster({
        baseUrl: window.location.origin,
        campusName: requestPosterCampus ? campuses.find((c) => String(c.id) === requestPosterCampus)?.name : undefined,
      });
    } catch {
      toast.error("Failed to generate poster");
    }
  }

  async function revoke(p: AccessPass) {
    if (!confirm(`Revoke "${p.label}"? Anyone using this code will lose access immediately.`)) return;
    try {
      await api.delete(`/api/access-passes/${p.id}`);
      load();
      toast.success("Access code revoked.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Quick Access</h1>
        <p className="text-sm text-gray-500 mt-1">
          Give people a short code for read-only access without an account — equipment status for the Praise Team, WiFi
          passwords for Leadership. Share the code (or post a QR to <span className="font-mono">/go</span>). Revoke anytime.
        </p>
      </div>

      {newCode && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
          Access code for <strong>{newCode.label}</strong>:{" "}
          <code className="bg-white px-2 py-1 rounded font-mono text-base tracking-widest">{newCode.code}</code>
          <div className="text-amber-700 mt-1">
            Share this securely — it won't be shown again. They enter it once at <span className="font-mono">/go</span> and
            stay signed in on that device for 30 days.
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => downloadPoster(newCode)}
              className="bg-brand-500 hover:bg-brand-600 text-white rounded px-3 py-1.5 text-xs font-medium"
            >
              ⬇ Download Poster (PDF)
            </button>
            <button onClick={() => setNewCode(null)} className="text-xs text-amber-700 underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 flex flex-wrap gap-2">
        <input
          required
          placeholder="Label (e.g. Praise Team – Equipment)"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className="border rounded px-3 py-2 text-sm">
          <option value="equipment">Equipment board</option>
          <option value="wifi">WiFi passwords</option>
        </select>
        <select
          required
          value={form.campusId}
          onChange={(e) => setForm({ ...form, campusId: e.target.value })}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">Campus</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">Create Code</button>
        {form.scope === "wifi" && (
          <label className="w-full flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.wifiAllNetworks}
              onChange={(e) => setForm({ ...form, wifiAllNetworks: e.target.checked })}
            />
            Include staff networks (not just guest) — for Leadership passes
          </label>
        )}
      </form>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-ink-900 text-left text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Scope</th>
              <th className="px-4 py-2">Campus</th>
              <th className="px-4 py-2">Last used</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {passes.map((p) => (
              <tr key={p.id} className="border-t dark:border-ink-700">
                <td className="px-4 py-2">{p.label}</td>
                <td className="px-4 py-2">{p.scope === "wifi" ? "WiFi" : "Equipment"}</td>
                <td className="px-4 py-2">{campusName(p.campusId)}</td>
                <td className="px-4 py-2">{p.lastUsedAt ? timeAgo(p.lastUsedAt) : "Never"}</td>
                <td className="px-4 py-2">{p.active ? "Active" : "Revoked"}</td>
                <td className="px-4 py-2 space-x-3 whitespace-nowrap">
                  <button onClick={() => rotate(p)} className="text-xs text-brand-600 hover:underline">
                    New code / Reprint
                  </button>
                  {p.active && (
                    <button onClick={() => revoke(p)} className="text-xs text-red-500 hover:underline">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {passes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No access codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
        <h2 className="font-semibold mb-1">Request Form Poster</h2>
        <p className="text-sm text-gray-500 mb-3">
          Print this and post it in offices and green rooms — anyone can scan it to submit an IT request (no code, no
          account needed).
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={requestPosterCampus}
            onChange={(e) => setRequestPosterCampus(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">No campus label</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={downloadRequestPoster}
            className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm font-medium"
          >
            ⬇ Download Request Poster (PDF)
          </button>
        </div>
      </div>
    </div>
  );
}
