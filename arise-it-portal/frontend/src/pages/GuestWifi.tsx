import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import PublicShell from "../components/PublicShell";
import type { GuestNetwork } from "../lib/types";

export default function GuestWifi() {
  const navigate = useNavigate();
  const [networks, setNetworks] = useState<GuestNetwork[]>([]);
  const [meta, setMeta] = useState<{ label: string; campusName: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch(`${API_BASE}/api/guest/me`, { credentials: "include" });
        if (!meRes.ok) {
          navigate("/go");
          return;
        }
        setMeta(await meRes.json());
        const res = await fetch(`${API_BASE}/api/guest/wifi`, { credentials: "include" });
        if (!res.ok) {
          navigate("/go");
          return;
        }
        const data = (await res.json()) as { networks: GuestNetwork[] };
        setNetworks(data.networks);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  async function copy(n: GuestNetwork) {
    await navigator.clipboard.writeText(n.password);
    setCopiedId(n.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function logout() {
    await fetch(`${API_BASE}/api/guest/logout`, { method: "POST", credentials: "include" });
    navigate("/go");
  }

  return (
    <PublicShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-display font-bold">WiFi Networks</h1>
            {meta && <p className="text-sm text-gray-500">{meta.campusName} · {meta.label}</p>}
          </div>
          <button onClick={logout} className="text-sm text-gray-500 hover:underline">
            Exit
          </button>
        </div>

        {loading && <div className="text-gray-400 text-sm">Loading…</div>}

        <div className="space-y-3">
          {networks.map((n) => (
            <div key={n.id} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-lg">{n.ssid}</div>
                {n.isGuest && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">Guest</span>
                )}
              </div>
              <div className="text-xs text-gray-400">
                {n.securityType}
                {n.band && ` · ${n.band}`}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base bg-gray-100 dark:bg-ink-900 rounded px-3 py-2 flex-1 break-all">
                  {n.password}
                </span>
                <button
                  onClick={() => copy(n)}
                  className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 text-sm shrink-0"
                >
                  {copiedId === n.id ? "Copied!" : "Copy"}
                </button>
              </div>
              {n.notes && <div className="text-xs text-gray-500">{n.notes}</div>}
            </div>
          ))}
          {!loading && networks.length === 0 && (
            <div className="text-gray-400 text-sm text-center py-8">No WiFi networks set for this campus yet.</div>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
