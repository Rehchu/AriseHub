import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../components/ToastProvider";
import type { Campus, LicenseAssignment, SoftwareLicense, User } from "../lib/types";

export default function Licenses() {
  const { user } = useAuth();
  const toast = useToast();
  const [licenses, setLicenses] = useState<SoftwareLicense[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Record<number, LicenseAssignment[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", vendor: "", campusId: "", seatsTotal: "1", renewalDate: "", cost: "", notes: "" });
  const [assignSelect, setAssignSelect] = useState<Record<number, string>>({});

  const canEdit = user?.role === "super_admin" || user?.role === "campus_admin";

  async function load() {
    const r = await api.get<{ licenses: SoftwareLicense[] }>("/api/licenses");
    setLicenses(r.licenses);
  }

  async function loadAssignments(licenseId: number) {
    const detail = await api.get<{ assignments: LicenseAssignment[] }>(`/api/licenses/${licenseId}`);
    setAssignments((prev) => ({ ...prev, [licenseId]: detail.assignments }));
  }

  useEffect(() => {
    load();
    api.get<{ campuses: Campus[] }>("/api/campuses").then((r) => setCampuses(r.campuses));
    if (user?.role === "super_admin") api.get<{ users: User[] }>("/api/users").then((r) => setUsers(r.users));
  }, []);

  function campusName(id: number | null) {
    if (!id) return "Org-wide";
    return campuses.find((c) => c.id === id)?.name ?? id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/licenses", {
        name: form.name,
        vendor: form.vendor || undefined,
        campusId: form.campusId ? Number(form.campusId) : undefined,
        seatsTotal: Number(form.seatsTotal),
        renewalDate: form.renewalDate || undefined,
        cost: form.cost ? Number(form.cost) : undefined,
        notes: form.notes || undefined,
      });
      setForm({ name: "", vendor: "", campusId: "", seatsTotal: "1", renewalDate: "", cost: "", notes: "" });
      setShowForm(false);
      load();
      toast.success("License added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add license");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this license?")) return;
    try {
      await api.delete(`/api/licenses/${id}`);
      load();
      toast.success("License deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function toggleAssignments(id: number) {
    if (assignments[id]) {
      setAssignments((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } else {
      await loadAssignments(id);
    }
  }

  async function assignSeat(licenseId: number) {
    const userId = Number(assignSelect[licenseId]);
    if (!userId) return;
    try {
      await api.post(`/api/licenses/${licenseId}/assign`, { assignedToUserId: userId });
      await loadAssignments(licenseId);
      load();
      toast.success("Seat assigned.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign seat");
    }
  }

  async function unassignSeat(licenseId: number, userId: number) {
    try {
      await api.delete(`/api/licenses/${licenseId}/assign/${userId}`);
      await loadAssignments(licenseId);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unassign seat");
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Software Licenses</h1>
        {canEdit && (
          <button onClick={() => setShowForm(!showForm)} className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 text-sm">
            + Add License
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Name (e.g. Adobe Creative Cloud)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Vendor"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Org-wide (no campus)</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Total seats"
              value={form.seatsTotal}
              onChange={(e) => setForm({ ...form, seatsTotal: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              placeholder="Renewal date"
              value={form.renewalDate}
              onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Cost"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
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

      <div className="space-y-3">
        {licenses.map((lic) => {
          const pctUsed = lic.seatsTotal > 0 ? Math.min(100, Math.round((lic.seatsUsed / lic.seatsTotal) * 100)) : 0;
          return (
            <div key={lic.id} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{lic.name}</div>
                  <div className="text-xs text-gray-500">
                    {lic.vendor && `${lic.vendor} · `}
                    {campusName(lic.campusId)}
                    {lic.renewalDate && ` · renews ${lic.renewalDate}`}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={() => remove(lic.id)} className="text-xs text-red-500 hover:underline">
                    Delete
                  </button>
                )}
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {lic.seatsUsed} / {lic.seatsTotal} seats used
                  </span>
                  <span>{pctUsed}%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-ink-900 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${pctUsed >= 100 ? "bg-brand-500" : "bg-emerald-500"}`}
                    style={{ width: `${pctUsed}%` }}
                  />
                </div>
              </div>
              {canEdit && (
                <button onClick={() => toggleAssignments(lic.id)} className="text-xs text-brand-600 hover:underline">
                  {assignments[lic.id] ? "Hide" : "Manage"} seat assignments
                </button>
              )}
              {assignments[lic.id] && (
                <div className="border-t dark:border-ink-700 pt-2 space-y-2">
                  {assignments[lic.id].map((a) => (
                    <div key={a.id} className="flex justify-between items-center text-sm">
                      <span>{a.userName}</span>
                      <button onClick={() => unassignSeat(lic.id, a.assignedToUserId)} className="text-xs text-red-500 hover:underline">
                        Unassign
                      </button>
                    </div>
                  ))}
                  {user?.role === "super_admin" && (
                    <div className="flex gap-2">
                      <select
                        value={assignSelect[lic.id] ?? ""}
                        onChange={(e) => setAssignSelect((prev) => ({ ...prev, [lic.id]: e.target.value }))}
                        className="border rounded-lg px-2 py-1.5 text-sm flex-1"
                      >
                        <option value="">Select a user…</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => assignSeat(lic.id)} className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 text-sm">
                        Assign
                      </button>
                    </div>
                  )}
                </div>
              )}
              {lic.notes && <div className="text-xs text-gray-500">{lic.notes}</div>}
            </div>
          );
        })}
        {licenses.length === 0 && <div className="text-gray-400">No software licenses tracked yet.</div>}
      </div>
    </div>
  );
}
