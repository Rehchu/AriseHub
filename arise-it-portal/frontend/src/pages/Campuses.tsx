import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import type { Campus, Location } from "../lib/types";

export default function Campuses() {
  const { user } = useAuth();
  const toast = useToast();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [campusName, setCampusName] = useState("");
  const [locationForm, setLocationForm] = useState({ campusId: "", name: "" });

  async function load() {
    const c = await api.get<{ campuses: Campus[] }>("/api/campuses");
    setCampuses(c.campuses);
    const l = await api.get<{ locations: Location[] }>("/api/locations");
    setLocations(l.locations);
  }

  useEffect(() => {
    load();
  }, []);

  async function addCampus(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/campuses", { name: campusName });
      setCampusName("");
      load();
      toast.success("Campus added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add campus");
    }
  }

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/locations", { campusId: Number(locationForm.campusId), name: locationForm.name });
      setLocationForm({ ...locationForm, name: "" });
      load();
      toast.success("Location added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add location");
    }
  }

  async function deleteCampus(id: number) {
    if (!confirm("Delete this campus? This cannot be undone.")) return;
    try {
      await api.delete(`/api/campuses/${id}`);
      load();
      toast.success("Campus deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete campus");
    }
  }

  async function deleteLocation(id: number) {
    try {
      await api.delete(`/api/locations/${id}`);
      load();
      toast.success("Location deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete location");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Campuses & Locations</h1>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
        <h2 className="font-semibold mb-3">Campuses</h2>
        {user?.role === "super_admin" && (
          <form onSubmit={addCampus} className="flex gap-2 mb-3">
            <input
              required
              placeholder="New campus name"
              value={campusName}
              onChange={(e) => setCampusName(e.target.value)}
              className="border rounded px-3 py-2 text-sm flex-1"
            />
            <button className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">Add</button>
          </form>
        )}
        <ul className="divide-y">
          {campuses.map((c) => (
            <li key={c.id} className="py-2 flex justify-between items-center text-sm">
              <span>{c.name}</span>
              {user?.role === "super_admin" && (
                <button onClick={() => deleteCampus(c.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4">
        <h2 className="font-semibold mb-3">Locations</h2>
        <form onSubmit={addLocation} className="flex gap-2 mb-3">
          <select
            required
            value={locationForm.campusId}
            onChange={(e) => setLocationForm({ ...locationForm, campusId: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">Campus</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Location name (e.g. Room 204)"
            value={locationForm.name}
            onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <button className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">Add</button>
        </form>
        <ul className="divide-y">
          {locations.map((l) => (
            <li key={l.id} className="py-2 flex justify-between items-center text-sm">
              <span>
                {l.name} <span className="text-gray-400">({campuses.find((c) => c.id === l.campusId)?.name})</span>
              </span>
              <button onClick={() => deleteLocation(l.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
