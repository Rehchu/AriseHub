import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import type { Asset, AssetModel, Campus, Category, Location } from "../lib/types";

export default function AssetForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<AssetModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    campusId: user?.campusId ?? "",
    locationId: "",
    categoryId: "",
    modelId: "",
    serialNumber: "",
    purchaseDate: "",
    purchaseCost: "",
    warrantyExpiry: "",
    notes: "",
  });

  useEffect(() => {
    api.get<{ campuses: Campus[] }>("/api/campuses").then((r) => setCampuses(r.campuses));
    api.get<{ locations: Location[] }>("/api/locations").then((r) => setLocations(r.locations));
    api.get<{ categories: Category[] }>("/api/categories").then((r) => setCategories(r.categories));
    api.get<{ models: AssetModel[] }>("/api/categories/models/all").then((r) => setModels(r.models));
    if (isEdit) {
      api.get<{ asset: Asset }>(`/api/assets/${id}`).then((r) => {
        const a = r.asset;
        setForm({
          campusId: String(a.campusId),
          locationId: a.locationId ? String(a.locationId) : "",
          categoryId: String(a.model.categoryId),
          modelId: String(a.modelId),
          serialNumber: a.serialNumber ?? "",
          purchaseDate: a.purchaseDate ?? "",
          purchaseCost: a.purchaseCost != null ? String(a.purchaseCost) : "",
          warrantyExpiry: a.warrantyExpiry ?? "",
          notes: a.notes ?? "",
        });
      });
    }
  }, [id]);

  const filteredModels = models.filter((m) => String(m.categoryId) === form.categoryId);
  const filteredLocations = locations.filter((l) => String(l.campusId) === form.campusId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      campusId: Number(form.campusId),
      locationId: form.locationId ? Number(form.locationId) : undefined,
      modelId: Number(form.modelId),
      serialNumber: form.serialNumber || undefined,
      purchaseDate: form.purchaseDate || undefined,
      purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
      warrantyExpiry: form.warrantyExpiry || undefined,
      notes: form.notes || undefined,
    };
    try {
      if (isEdit) {
        await api.put(`/api/assets/${id}`, payload);
        toast.success("Asset updated.");
        navigate(`/assets/${id}`);
      } else {
        const { asset } = await api.post<{ asset: Asset }>("/api/assets", payload);
        toast.success("Asset created.");
        navigate(`/assets/${asset.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save asset");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{isEdit ? "Edit Asset" : "Add Asset"}</h1>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Campus</label>
            <select
              required
              value={form.campusId}
              onChange={(e) => setForm({ ...form, campusId: e.target.value, locationId: "" })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select campus</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <select
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">None</option>
              {filteredLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value, modelId: "" })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Brand / Model</label>
            <select
              required
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select model</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brand} {m.modelName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Serial Number</label>
            <input
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Purchase Date</label>
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Purchase Cost</label>
            <input
              type="number"
              step="0.01"
              value={form.purchaseCost}
              onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Warranty Expiry</label>
            <input
              type="date"
              value={form.warrantyExpiry}
              onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full border rounded px-3 py-2"
            rows={3}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2">
            Save
          </button>
          <button type="button" onClick={() => navigate(-1)} className="border rounded px-4 py-2">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
