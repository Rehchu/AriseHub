import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AuditEntry } from "../lib/types";

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    api.get<{ entries: AuditEntry[] }>("/api/audit-log").then((r) => setEntries(r.entries));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-ink-900 text-left text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-4 py-2 whitespace-nowrap">{e.createdAt}</td>
                <td className="px-4 py-2">{e.userName ?? "System"}</td>
                <td className="px-4 py-2">{e.action.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">
                  {e.entityType} #{e.entityId}
                </td>
                <td className="px-4 py-2">{e.ipAddress ?? "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
