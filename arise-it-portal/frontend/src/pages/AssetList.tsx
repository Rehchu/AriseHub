import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import type { Asset, Campus, Category } from "../lib/types";

const statusColors: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  checked_out: "bg-blue-100 text-blue-800",
  in_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-200 text-gray-700",
  lost: "bg-red-100 text-red-800",
};

export default function AssetList() {
  const { user } = useAuth();
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [campusId, setCampusId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadAssets() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (campusId) params.set("campusId", campusId);
    if (categoryId) params.set("categoryId", categoryId);
    if (status) params.set("status", status);
    api.get<{ assets: Asset[] }>(`/api/assets?${params}`).then((r) => setAssets(r.assets));
  }

  useEffect(() => {
    api.get<{ campuses: Campus[] }>("/api/campuses").then((r) => setCampuses(r.campuses));
    api.get<{ categories: Category[] }>("/api/categories").then((r) => setCategories(r.categories));
  }, []);

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, campusId, categoryId, status]);

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const response = await fetch(`${API_BASE}/api/assets/import/csv`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const data = (await response.json()) as { imported: number; errors: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Import failed");
      loadAssets();
      if (data.errors.length > 0) {
        toast.error(`Imported ${data.imported}, ${data.errors.length} row(s) skipped — see console for details.`);
        console.warn("CSV import errors:", data.errors);
      } else {
        toast.success(`Imported ${data.imported} asset(s).`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const canEdit = user?.role === "super_admin" || user?.role === "campus_admin";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Assets</h1>
        <div className="flex gap-2 flex-wrap">
          <a href={`${API_BASE}/api/assets/export/csv`} className="border rounded px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-ink-800">
            Export CSV
          </a>
          <button
            onClick={async () => {
              if (assets.length === 0) return toast.error("No assets to label");
              try {
                const { generateLabelSheet } = await import("../lib/poster");
                await generateLabelSheet(
                  assets.map((a) => ({ id: a.id, assetTag: a.assetTag, brand: a.model.brand, modelName: a.model.modelName })),
                  window.location.origin
                );
              } catch {
                toast.error("Failed to generate labels");
              }
            }}
            className="border rounded px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-ink-800"
          >
            Print Labels (PDF)
          </button>
          {canEdit && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="border rounded px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-ink-800 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import CSV"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = "";
                }}
              />
              <Link to="/assets/new" className="bg-brand-500 hover:bg-brand-600 text-white rounded px-3 py-2 text-sm">
                + Add Asset
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Search tag, serial, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="">All Campuses</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="checked_out">Checked Out</option>
          <option value="in_repair">In Repair</option>
          <option value="retired">Retired</option>
          <option value="lost">Lost</option>
        </select>
      </div>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-ink-900 text-left text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2">Tag</th>
              <th className="px-4 py-2">Brand / Model</th>
              <th className="px-4 py-2">Serial</th>
              <th className="px-4 py-2 hidden sm:table-cell">Campus</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Assigned To</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-t dark:border-ink-700 hover:bg-gray-50 dark:hover:bg-ink-700">
                <td className="px-4 py-2">
                  <Link to={`/assets/${a.id}`} className="text-brand-600 hover:underline font-medium">
                    {a.assetTag}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {a.model.brand} {a.model.modelName}
                </td>
                <td className="px-4 py-2">{a.serialNumber ?? "—"}</td>
                <td className="px-4 py-2 hidden sm:table-cell">{campuses.find((c) => c.id === a.campusId)?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[a.status]}`}>
                    {a.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2">{a.assignedToName ?? "—"}</td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No assets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
