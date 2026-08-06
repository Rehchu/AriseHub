import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import type { Asset, AssetHistoryEntry, MaintenanceRecord } from "../lib/types";

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<AssetHistoryEntry[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [checkoutName, setCheckoutName] = useState("");
  const [maintForm, setMaintForm] = useState({ description: "", cost: "", vendor: "", performedAt: "", nextDueDate: "" });
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function load() {
    const r = await api.get<{ asset: Asset; history: AssetHistoryEntry[]; maintenance: MaintenanceRecord[] }>(`/api/assets/${id}`);
    setAsset(r.asset);
    setHistory(r.history);
    setMaintenance(r.maintenance);
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!asset) return <div className="text-gray-500">Loading…</div>;

  const canEdit = user?.role === "super_admin" || user?.role === "campus_admin";

  async function handleCheckout() {
    if (!checkoutName) return;
    try {
      await api.post(`/api/assets/${id}/checkout`, { assignedToName: checkoutName });
      setCheckoutName("");
      load();
      toast.success("Asset checked out.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    }
  }

  async function handleCheckin() {
    try {
      await api.post(`/api/assets/${id}/checkin`);
      load();
      toast.success("Asset checked in.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this asset permanently?")) return;
    try {
      await api.delete(`/api/assets/${id}`);
      toast.success("Asset deleted.");
      navigate("/assets");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleMaintSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/api/assets/${id}/maintenance`, {
        description: maintForm.description,
        cost: maintForm.cost ? Number(maintForm.cost) : undefined,
        vendor: maintForm.vendor || undefined,
        performedAt: maintForm.performedAt,
        nextDueDate: maintForm.nextDueDate || undefined,
      });
      setMaintForm({ description: "", cost: "", vendor: "", performedAt: "", nextDueDate: "" });
      setShowMaintForm(false);
      load();
      toast.success("Maintenance logged.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log maintenance");
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch(`${API_BASE}/api/assets/${id}/photo`, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      await load();
      toast.success("Photo uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  const labelUrl = `${window.location.origin}/assets/${asset.id}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{asset.assetTag}</h1>
          <div className="text-gray-500">
            {asset.model.brand} {asset.model.modelName}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link to={`/assets/${asset.id}/edit`} className="border rounded px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-ink-800">
              Edit
            </Link>
            {user?.role === "super_admin" && (
              <button onClick={handleDelete} className="border border-red-300 text-red-600 rounded px-3 py-2 text-sm hover:bg-red-50">
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {asset.photoUrl && (
            <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
              <img src={`${API_BASE}${asset.photoUrl}`} alt={asset.assetTag} className="max-h-64 rounded-lg mx-auto" />
            </div>
          )}

          <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500">Status</div>
              <div className="font-medium">{asset.status.replace("_", " ")}</div>
            </div>
            <div>
              <div className="text-gray-500">Serial Number</div>
              <div className="font-medium">{asset.serialNumber ?? "—"}</div>
            </div>
            <div>
              <div className="text-gray-500">Assigned To</div>
              <div className="font-medium">{asset.assignedToName ?? "—"}</div>
            </div>
            <div>
              <div className="text-gray-500">Purchase Date</div>
              <div className="font-medium">{asset.purchaseDate ?? "—"}</div>
            </div>
            <div>
              <div className="text-gray-500">Purchase Cost</div>
              <div className="font-medium">{asset.purchaseCost != null ? `$${asset.purchaseCost}` : "—"}</div>
            </div>
            <div>
              <div className="text-gray-500">Warranty Expiry</div>
              <div className="font-medium">{asset.warrantyExpiry ?? "—"}</div>
            </div>
            {asset.notes && (
              <div className="col-span-2">
                <div className="text-gray-500">Notes</div>
                <div className="font-medium">{asset.notes}</div>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
              <h2 className="font-semibold mb-3">Photo</h2>
              <label className="inline-block cursor-pointer border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-ink-700">
                {uploadingPhoto ? "Uploading…" : asset.photoUrl ? "Replace photo" : "Upload photo"}
                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingPhoto} onChange={handlePhotoSelect} />
              </label>
            </div>
          )}

          {canEdit && (
            <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
              <h2 className="font-semibold mb-3">Checkout / Checkin</h2>
              {asset.status === "checked_out" ? (
                <button onClick={handleCheckin} className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">
                  Check In (currently with {asset.assignedToName})
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    placeholder="Person or room name"
                    value={checkoutName}
                    onChange={(e) => setCheckoutName(e.target.value)}
                    className="border rounded px-3 py-2 text-sm flex-1"
                  />
                  <button onClick={handleCheckout} className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">
                    Check Out
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold">Maintenance History</h2>
              {canEdit && (
                <button onClick={() => setShowMaintForm(!showMaintForm)} className="text-sm text-brand-600 hover:underline">
                  + Log maintenance
                </button>
              )}
            </div>
            {showMaintForm && (
              <form onSubmit={handleMaintSubmit} className="space-y-2 mb-4 border-b pb-4">
                <input
                  required
                  placeholder="Description"
                  value={maintForm.description}
                  onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    required
                    type="date"
                    value={maintForm.performedAt}
                    onChange={(e) => setMaintForm({ ...maintForm, performedAt: e.target.value })}
                    className="border rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Cost"
                    value={maintForm.cost}
                    onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })}
                    className="border rounded px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Vendor"
                    value={maintForm.vendor}
                    onChange={(e) => setMaintForm({ ...maintForm, vendor: e.target.value })}
                    className="border rounded px-3 py-2 text-sm"
                  />
                </div>
                <input
                  type="date"
                  placeholder="Next due date"
                  value={maintForm.nextDueDate}
                  onChange={(e) => setMaintForm({ ...maintForm, nextDueDate: e.target.value })}
                  className="border rounded px-3 py-2 text-sm"
                />
                <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">
                  Save
                </button>
              </form>
            )}
            <ul className="space-y-2 text-sm">
              {maintenance.map((m) => (
                <li key={m.id} className="border-b pb-2">
                  <div className="font-medium">{m.description}</div>
                  <div className="text-gray-500">
                    {m.performedAt} {m.vendor && `· ${m.vendor}`} {m.cost != null && `· $${m.cost}`}
                    {m.nextDueDate && ` · next due ${m.nextDueDate}`}
                  </div>
                </li>
              ))}
              {maintenance.length === 0 && <li className="text-gray-400">No maintenance logged yet.</li>}
            </ul>
          </div>

          <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
            <h2 className="font-semibold mb-3">History</h2>
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id} className="text-gray-600">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{h.action.replace("_", " ")}</span> — {h.createdAt}
                  {h.notes && ` — ${h.notes}`}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="print-label bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 flex flex-col items-center gap-2 h-fit">
          <QRCodeSVG value={labelUrl} size={140} />
          <div className="font-mono text-sm">{asset.assetTag}</div>
          <div className="text-xs text-gray-500 text-center">
            {asset.model.brand} {asset.model.modelName}
          </div>
          <button onClick={() => window.print()} className="no-print text-sm text-brand-600 hover:underline">
            Print label
          </button>
        </div>
      </div>
    </div>
  );
}
