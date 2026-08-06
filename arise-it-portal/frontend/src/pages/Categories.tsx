import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import type { AssetModel, Category } from "../lib/types";

export default function Categories() {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<AssetModel[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [modelForm, setModelForm] = useState({ categoryId: "", brand: "", modelName: "" });

  async function load() {
    const c = await api.get<{ categories: Category[] }>("/api/categories");
    setCategories(c.categories);
    const m = await api.get<{ models: AssetModel[] }>("/api/categories/models/all");
    setModels(m.models);
  }

  useEffect(() => {
    load();
  }, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/categories", { name: categoryName });
      setCategoryName("");
      load();
      toast.success("Category added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    }
  }

  async function addModel(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/categories/models", {
        categoryId: Number(modelForm.categoryId),
        brand: modelForm.brand,
        modelName: modelForm.modelName,
      });
      setModelForm({ ...modelForm, brand: "", modelName: "" });
      load();
      toast.success("Model added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add model");
    }
  }

  async function deleteCategory(id: number) {
    try {
      await api.delete(`/api/categories/${id}`);
      load();
      toast.success("Category deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  async function deleteModel(id: number) {
    try {
      await api.delete(`/api/categories/models/${id}`);
      load();
      toast.success("Model deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete model");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Categories & Models</h1>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
        <h2 className="font-semibold mb-3">Categories</h2>
        <form onSubmit={addCategory} className="flex gap-2 mb-3">
          <input
            required
            placeholder="e.g. Projector, Laptop, Audio"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <button className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">Add</button>
        </form>
        <ul className="divide-y">
          {categories.map((c) => (
            <li key={c.id} className="py-2 flex justify-between items-center text-sm">
              <span>{c.name}</span>
              <button onClick={() => deleteCategory(c.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
        <h2 className="font-semibold mb-3">Models (reusable brand/model templates)</h2>
        <form onSubmit={addModel} className="flex gap-2 mb-3">
          <select
            required
            value={modelForm.categoryId}
            onChange={(e) => setModelForm({ ...modelForm, categoryId: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Brand"
            value={modelForm.brand}
            onChange={(e) => setModelForm({ ...modelForm, brand: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Model name"
            value={modelForm.modelName}
            onChange={(e) => setModelForm({ ...modelForm, modelName: e.target.value })}
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <button className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">Add</button>
        </form>
        <ul className="divide-y">
          {models.map((m) => (
            <li key={m.id} className="py-2 flex justify-between items-center text-sm">
              <span>
                {m.brand} {m.modelName}{" "}
                <span className="text-gray-400">({categories.find((c) => c.id === m.categoryId)?.name})</span>
              </span>
              <button onClick={() => deleteModel(m.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
