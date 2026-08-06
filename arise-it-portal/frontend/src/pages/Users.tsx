import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import type { Campus, User } from "../lib/types";

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "viewer", campusId: "" });
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string; emailSent?: boolean } | null>(null);

  async function load() {
    const u = await api.get<{ users: User[] }>("/api/users");
    setUsers(u.users);
    const c = await api.get<{ campuses: Campus[] }>("/api/campuses");
    setCampuses(c.campuses);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { user, tempPassword: pw, emailSent } = await api.post<{ user: User; tempPassword: string; emailSent?: boolean }>(
        "/api/users",
        {
          name: form.name,
          email: form.email,
          role: form.role,
          campusId: form.campusId ? Number(form.campusId) : undefined,
        }
      );
      setTempPassword({ email: user.email, password: pw, emailSent });
      setForm({ name: "", email: "", role: "viewer", campusId: "" });
      load();
      toast.success(emailSent ? "User created — invite emailed." : "User created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    }
  }

  async function toggleActive(u: User) {
    if (u.active && !confirm(`Deactivate ${u.name}?`)) return;
    try {
      if (u.active) {
        await api.delete(`/api/users/${u.id}`);
      } else {
        await api.put(`/api/users/${u.id}`, { active: true });
      }
      load();
      toast.success(u.active ? "User deactivated." : "User reactivated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function resetPassword(u: User) {
    try {
      const { tempPassword: pw, emailSent } = await api.post<{ tempPassword: string; emailSent?: boolean }>(
        `/api/users/${u.id}/reset-password`
      );
      setTempPassword({ email: u.email, password: pw, emailSent });
      if (emailSent) toast.success("Reset email sent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Users</h1>

      {tempPassword && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
          {tempPassword.emailSent ? (
            <div className="text-green-700 font-medium mb-1">✓ Invite emailed to {tempPassword.email}.</div>
          ) : (
            <div className="text-amber-800 font-medium mb-1">Email not sent — share this temp password manually.</div>
          )}
          Temporary password for <strong>{tempPassword.email}</strong>: <code className="bg-white px-2 py-1 rounded">{tempPassword.password}</code>
          <div className="text-amber-700 mt-1">
            {tempPassword.emailSent
              ? "Shown here once as a backup. They'll set a new password on first login."
              : "Share this securely — it won't be shown again. They'll set a new password on first login."}
          </div>
          <button onClick={() => setTempPassword(null)} className="text-xs text-amber-700 underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 flex flex-wrap gap-2">
        <input
          required
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border rounded px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border rounded px-3 py-2 text-sm"
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="border rounded px-3 py-2 text-sm">
          <option value="viewer">Viewer</option>
          <option value="campus_admin">Campus Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <select
          value={form.campusId}
          onChange={(e) => setForm({ ...form, campusId: e.target.value })}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">No campus scope</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">Create User</button>
      </form>

      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-ink-900 text-left text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Campus</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t dark:border-ink-700">
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.role.replace("_", " ")}</td>
                <td className="px-4 py-2">{campuses.find((c) => c.id === u.campusId)?.name ?? "—"}</td>
                <td className="px-4 py-2">{u.active ? "Active" : "Inactive"}</td>
                <td className="px-4 py-2 space-x-2">
                  <button onClick={() => resetPassword(u)} className="text-xs text-brand-600 hover:underline">
                    Reset PW
                  </button>
                  <button onClick={() => toggleActive(u)} className="text-xs text-red-500 hover:underline">
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
