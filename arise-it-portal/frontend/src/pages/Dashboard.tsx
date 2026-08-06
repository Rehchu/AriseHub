import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import StatTile from "../components/StatTile";
import { timeAgo, initials } from "../lib/format";
import type { Asset, Consumable, MaintenanceRecord, SoftwareLicense, Ticket } from "../lib/types";

interface DashboardData {
  totalAssets: number;
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byCampus: { campus: string; count: number }[];
  warrantyExpiringSoon: Asset[];
  maintenanceDueSoon: (MaintenanceRecord & { asset: Asset })[];
  lowStockConsumables: Consumable[];
  licensesRenewingSoon: SoftwareLicense[];
  tickets: {
    waitingForMe: number;
    assignedToMe: number;
    unassigned: number;
    dueSoon: number;
    recent: Ticket[];
  };
}

const priorityDot: Record<string, string> = {
  urgent: "bg-brand-500",
  high: "bg-orange-500",
  medium: "bg-gold-500",
  low: "bg-slate-400",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<DashboardData>("/api/dashboard").then(setData);
  }, []);

  if (!data) return <div className="text-gray-500">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Waiting for me" value={data.tickets.waitingForMe} color="brand" onClick={() => navigate("/requests")} />
        <StatTile label="Assigned to me" value={data.tickets.assignedToMe} color="ink" onClick={() => navigate("/requests")} />
        <StatTile label="Unassigned requests" value={data.tickets.unassigned} color="gold" onClick={() => navigate("/requests")} />
        <StatTile label="Total Assets" value={data.totalAssets} color="slate" onClick={() => navigate("/assets")} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">Recent Requests</h2>
            <Link to="/requests" className="text-xs text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {data.tickets.recent.map((t) => (
              <Link
                key={t.id}
                to={`/requests/${t.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[t.priority]}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.subject}</div>
                  <div className="text-xs text-gray-400">
                    {t.requesterName} · {timeAgo(t.createdAt)}
                  </div>
                </div>
                <div className="w-6 h-6 rounded-full bg-ink-800 text-white text-[10px] flex items-center justify-center font-medium shrink-0">
                  {initials(t.requesterName)}
                </div>
              </Link>
            ))}
            {data.tickets.recent.length === 0 && <div className="text-sm text-gray-400 px-2 py-4">No requests yet.</div>}
          </div>
        </div>

        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <h2 className="font-display font-semibold mb-3">Assets by Status</h2>
          <ul className="space-y-1 text-sm">
            {data.byStatus.map((s) => (
              <li key={s.status} className="flex justify-between">
                <span className="capitalize">{s.status.replace("_", " ")}</span>
                <span className="font-medium">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <h2 className="font-display font-semibold mb-3">By Category</h2>
          <ul className="space-y-1 text-sm">
            {data.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between">
                <span>{c.category}</span>
                <span className="font-medium">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <h2 className="font-display font-semibold mb-3">By Campus</h2>
          <ul className="space-y-1 text-sm">
            {data.byCampus.map((c) => (
              <li key={c.campus} className="flex justify-between">
                <span>{c.campus}</span>
                <span className="font-medium">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <h2 className="font-display font-semibold mb-3 text-amber-700">Warranty Expiring (90 days)</h2>
          {data.warrantyExpiringSoon.length === 0 && <div className="text-sm text-gray-400">Nothing expiring soon.</div>}
          <ul className="space-y-1 text-sm">
            {data.warrantyExpiringSoon.map((a) => (
              <li key={a.id}>
                <Link to={`/assets/${a.id}`} className="text-brand-600 hover:underline">
                  {a.assetTag}
                </Link>{" "}
                — expires {a.warrantyExpiry}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <h2 className="font-display font-semibold mb-3 text-amber-700">Maintenance Due (90 days)</h2>
          {data.maintenanceDueSoon.length === 0 && <div className="text-sm text-gray-400">Nothing due soon.</div>}
          <ul className="space-y-1 text-sm">
            {data.maintenanceDueSoon.map((m) => (
              <li key={m.id}>
                <Link to={`/assets/${m.asset.id}`} className="text-brand-600 hover:underline">
                  {m.asset.assetTag}
                </Link>{" "}
                — {m.description} due {m.nextDueDate}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <h2 className="font-display font-semibold mb-3 text-amber-700">Low Stock Consumables</h2>
          {data.lowStockConsumables.length === 0 && <div className="text-sm text-gray-400">Nothing low on stock.</div>}
          <ul className="space-y-1 text-sm">
            {data.lowStockConsumables.map((c) => (
              <li key={c.id}>
                <Link to="/consumables" className="text-brand-600 hover:underline">
                  {c.name}
                </Link>{" "}
                — {c.quantityOnHand} left (reorder at {c.reorderThreshold})
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
          <h2 className="font-display font-semibold mb-3 text-amber-700">Licenses Renewing Soon</h2>
          {data.licensesRenewingSoon.length === 0 && <div className="text-sm text-gray-400">Nothing renewing soon.</div>}
          <ul className="space-y-1 text-sm">
            {data.licensesRenewingSoon.map((l) => (
              <li key={l.id}>
                <Link to="/licenses" className="text-brand-600 hover:underline">
                  {l.name}
                </Link>{" "}
                — renews {l.renewalDate}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
