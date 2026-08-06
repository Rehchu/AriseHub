import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import PublicShell from "../components/PublicShell";
import type { GuestAsset } from "../lib/types";

const statusColors: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  checked_out: "bg-blue-100 text-blue-800",
  in_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-200 text-gray-700",
  lost: "bg-red-100 text-red-800",
};

export default function GuestEquipment() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<GuestAsset[]>([]);
  const [meta, setMeta] = useState<{ label: string; campusName: string } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
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
        const res = await fetch(`${API_BASE}/api/guest/equipment`, { credentials: "include" });
        if (!res.ok) {
          navigate("/go");
          return;
        }
        const data = (await res.json()) as { assets: GuestAsset[] };
        setAssets(data.assets);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const categories = useMemo(() => [...new Set(assets.map((a) => a.category))].sort(), [assets]);

  const filtered = assets.filter((a) => {
    if (category && a.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.assetTag.toLowerCase().includes(q) ||
        a.brand.toLowerCase().includes(q) ||
        a.modelName.toLowerCase().includes(q) ||
        (a.notes ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function logout() {
    await fetch(`${API_BASE}/api/guest/logout`, { method: "POST", credentials: "include" });
    navigate("/go");
  }

  return (
    <PublicShell wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-display font-bold">Equipment</h1>
            {meta && <p className="text-sm text-gray-500">{meta.campusName} · {meta.label}</p>}
          </div>
          <button onClick={logout} className="text-sm text-gray-500 hover:underline">
            Exit
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Search equipment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px]"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {loading && <div className="text-gray-400 text-sm">Loading…</div>}

        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">
                    {a.brand} {a.modelName}
                  </div>
                  <div className="text-xs text-gray-400">
                    {a.assetTag} · {a.category}
                  </div>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${statusColors[a.status]}`}>
                  {a.status.replace("_", " ")}
                </span>
              </div>
              {a.lastMaintenance ? (
                <div className="text-sm bg-gray-50 dark:bg-ink-900 rounded-lg px-3 py-2">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Last serviced</div>
                  {a.lastMaintenance.description}
                  <div className="text-xs text-gray-400">
                    {a.lastMaintenance.performedAt}
                    {a.lastMaintenance.nextDueDate && ` · next due ${a.lastMaintenance.nextDueDate}`}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400">No maintenance logged yet.</div>
              )}
              {a.notes && <div className="text-xs text-gray-500">{a.notes}</div>}
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-gray-400 text-sm col-span-full text-center py-8">No equipment found.</div>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
