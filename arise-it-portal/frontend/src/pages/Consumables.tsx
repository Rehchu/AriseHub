import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import type { Campus, Consumable } from "../lib/types";

export default function Consumables() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Consumable[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    campusId: user?.campusId ? String(user.campusId) : "",
    quantityOnHand: "0",
    reorderThreshold: "0",
    notes: "",
  });

  const canEdit = user?.role === "super_admin" || user?.role === "campus_admin";

  async function load() {
    const r = await api.get<{ consumables: Consumable[] }>("/api/consumables");
    setItems(r.consumables);
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
      await api.post("/api/consumables", {
        name: form.name,
        category: form.category || undefined,
        campusId: Number(form.campusId),
        quantityOnHand: Number(form.quantityOnHand),
        reorderThreshold: Number(form.reorderThreshold),
        notes: form.notes || undefined,
      });
      setForm({ ...form, name: "", category: "", quantityOnHand: "0", reorderThreshold: "0", notes: "" });
      setShowForm(false);
      load();
      toast.success("Consumable added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add consumable");
    }
  }

  async function adjust(id: number, delta: number) {
    try {
      await api.post(`/api/consumables/${id}/adjust`, { delta });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust quantity");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this consumable?")) return;
    try {
      await api.delete(`/api/consumables/${id}`);
      load();
      toast.success("Consumable deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Consumables</h1>
        {canEdit && (
          <button onClick={() => setShowForm(!showForm)} className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 text-sm">
            + Add Consumable
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Name (e.g. HDMI cables)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Category (optional)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <select
              required
              value={form.campusId}
              onChange={(e) => setForm({ ...form, campusId: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Campus</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Qty on hand"
                value={form.quantityOnHand}
                onChange={(e) => setForm({ ...form, quantityOnHand: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Reorder at"
                value={form.reorderThreshold}
                onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 text-sm">
            Save
          </button>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((item) => {
          const low = item.quantityOnHand <= item.reorderThreshold;
          return (
            <div key={item.id} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-xs text-gray-500">
                    {campusName(item.campusId)} {item.category && `· ${item.category}`}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={() => remove(item.id)} className="text-xs text-red-500 hover:underline">
                    Delete
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-display font-bold ${low ? "text-brand-600" : ""}`}>{item.quantityOnHand}</span>
                <span className="text-xs text-gray-400">on hand (reorder at {item.reorderThreshold})</span>
                {low && (
                  <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-brand-100 text-brand-700">Low stock</span>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button onClick={() => adjust(item.id, -1)} className="border rounded-lg px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-ink-700">
                    − 1
                  </button>
                  <button onClick={() => adjust(item.id, 1)} className="border rounded-lg px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-ink-700">
                    + 1
                  </button>
                  <button onClick={() => adjust(item.id, 10)} className="border rounded-lg px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-ink-700">
                    + 10
                  </button>
                </div>
              )}
              {item.notes && <div className="text-xs text-gray-500">{item.notes}</div>}
            </div>
          );
        })}
        {items.length === 0 && <div className="text-gray-400">No consumables tracked yet.</div>}
      </div>
    </div>
  );
}
