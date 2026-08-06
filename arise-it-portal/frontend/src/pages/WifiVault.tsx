import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import type { Campus, WifiNetwork } from "../lib/types";

export default function WifiVault() {
  const { user } = useAuth();
  const toast = useToast();
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    campusId: user?.campusId ? String(user.campusId) : "",
    ssid: "",
    password: "",
    securityType: "WPA2",
    band: "",
    vlan: "",
    isGuest: false,
    notes: "",
  });

  const canEdit = user?.role === "super_admin" || user?.role === "campus_admin";

  async function load() {
    const r = await api.get<{ networks: WifiNetwork[] }>("/api/wifi");
    setNetworks(r.networks);
  }

  useEffect(() => {
    load();
    api.get<{ campuses: Campus[] }>("/api/campuses").then((r) => setCampuses(r.campuses));
  }, []);

  async function reveal(id: number) {
    try {
      const r = await api.get<{ password: string }>(`/api/wifi/${id}/reveal`);
      setRevealed((prev) => ({ ...prev, [id]: r.password }));
      setTimeout(() => setRevealed((prev) => ({ ...prev, [id]: "" })), 20000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reveal password");
    }
  }

  async function copy(id: number) {
    try {
      if (!revealed[id]) await reveal(id);
      const password = revealed[id] ?? (await api.get<{ password: string }>(`/api/wifi/${id}/reveal`)).password;
      await navigator.clipboard.writeText(password);
      toast.success("Password copied to clipboard.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy password");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/wifi", { ...form, campusId: Number(form.campusId) });
      setForm({ ...form, ssid: "", password: "", notes: "" });
      setShowForm(false);
      load();
      toast.success("WiFi network added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add network");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this WiFi network?")) return;
    try {
      await api.delete(`/api/wifi/${id}`);
      load();
      toast.success("WiFi network deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function campusName(cid: number) {
    return campuses.find((c) => c.id === cid)?.name ?? cid;
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">WiFi Vault</h1>
        {canEdit && (
          <button onClick={() => setShowForm(!showForm)} className="bg-brand-500 hover:bg-brand-600 text-white rounded px-3 py-2 text-sm">
            + Add Network
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              required
              value={form.campusId}
              onChange={(e) => setForm({ ...form, campusId: e.target.value })}
              className="border rounded px-3 py-2"
            >
              <option value="">Select campus</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="SSID"
              value={form.ssid}
              onChange={(e) => setForm({ ...form, ssid: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <input
              required
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <select
              value={form.securityType}
              onChange={(e) => setForm({ ...form, securityType: e.target.value })}
              className="border rounded px-3 py-2"
            >
              <option>WPA2</option>
              <option>WPA3</option>
              <option>Open</option>
            </select>
            <input
              placeholder="Band (e.g. 5GHz)"
              value={form.band}
              onChange={(e) => setForm({ ...form, band: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <input
              placeholder="VLAN"
              value={form.vlan}
              onChange={(e) => setForm({ ...form, vlan: e.target.value })}
              className="border rounded px-3 py-2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isGuest} onChange={(e) => setForm({ ...form, isGuest: e.target.checked })} />
            Guest network
          </label>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
          <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">
            Save
          </button>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {networks.map((n) => (
          <div key={n.id} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-1">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{n.ssid}</div>
                <div className="text-xs text-gray-500">
                  {campusName(n.campusId)} · {n.securityType} {n.band && `· ${n.band}`} {n.isGuest && "· Guest"}
                </div>
              </div>
              {canEdit && (
                <button onClick={() => handleDelete(n.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm mt-2">
              <span className="font-mono bg-gray-100 dark:bg-ink-700 dark:text-gray-100 rounded px-2 py-1">{revealed[n.id] || "••••••••"}</span>
              {canEdit && (
                <>
                  <button onClick={() => reveal(n.id)} className="text-brand-600 hover:underline text-xs">
                    Reveal
                  </button>
                  <button onClick={() => copy(n.id)} className="text-brand-600 hover:underline text-xs">
                    Copy
                  </button>
                </>
              )}
            </div>
            {n.notes && <div className="text-xs text-gray-500 mt-1">{n.notes}</div>}
          </div>
        ))}
        {networks.length === 0 && <div className="text-gray-400">No WiFi networks yet.</div>}
      </div>
    </div>
  );
}
