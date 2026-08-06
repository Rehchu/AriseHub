import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const forced = params.get("forcePasswordChange") === "1";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Profile</h1>
      {forced && !success && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          Please set a new password before continuing.
        </div>
      )}
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 text-sm space-y-1">
        <div>
          <span className="text-gray-500">Name:</span> {user.name}
        </div>
        <div>
          <span className="text-gray-500">Email:</span> {user.email}
        </div>
        <div>
          <span className="text-gray-500">Role:</span> {user.role.replace("_", " ")}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="font-semibold">Change Password</h2>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        {success && <div className="text-sm text-green-700 bg-green-50 rounded p-2">Password updated.</div>}
        <input
          type="password"
          required
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="New password (min 8 characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-2 text-sm">
          Update Password
        </button>
      </form>
    </div>
  );
}
