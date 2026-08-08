import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

/** Plain English, because "profile.privileged_change" is not a sentence. */
const LABELS: Record<string, string> = {
  "profile.privileged_change": "Permissions changed",
  "guardian.insert": "Pickup authorisation added",
  "guardian.update": "Pickup authorisation changed",
  "guardian.delete": "Pickup authorisation removed",
  "checkin.released_without_authorisation": "Child released to someone not on the pickup list",
  "invite_link.created": "Invite link issued",
};

/** Actions worth a second look sit in red. */
const SERIOUS = new Set([
  "checkin.released_without_authorisation",
  "profile.privileged_change",
  "guardian.delete",
]);

function describe(row: AuditRow): string {
  const d = (row.details ?? {}) as Record<string, string | number | boolean | null>;
  switch (row.action) {
    case "profile.privileged_change": {
      const changes = (row.details?.changes ?? {}) as Record<string, [unknown, unknown]>;
      const parts = Object.entries(changes).map(
        ([field, [from, to]]) => `${field}: ${String(from)} → ${String(to)}`,
      );
      return `${d.subject ?? "someone"} — ${parts.join(", ")}`;
    }
    case "guardian.insert":
    case "guardian.update":
    case "guardian.delete":
      return `${d.guardian ?? "someone"} for ${d.child ?? "a child"}${
        d.can_pickup === false ? " (not authorised to collect)" : ""
      }`;
    case "checkin.released_without_authorisation":
      return `${d.child ?? "a child"} — “${d.note ?? "no reason recorded"}”`;
    case "invite_link.created":
      return `${d.label ?? "link"} · role ${d.role ?? "?"} · ${
        d.max_uses == null ? "unlimited uses" : `${d.max_uses} uses`
      }`;
    default:
      return JSON.stringify(row.details ?? {});
  }
}

export default async function AuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  if ((me as { role?: string } | null)?.role !== "Super_Admin") redirect("/dashboard");

  const { data: rows } = await supabase
    .from("chms_audit_log")
    .select("id, user_id, action, entity_type, entity_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const log = (rows ?? []) as AuditRow[];

  // Resolve actor names separately — chms_audit_log.user_id points at profiles,
  // and 0030 means the embed would need column grants the join doesn't get.
  const actorIds = [...new Set(log.map((r) => r.user_id).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  if (actorIds.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of (people ?? []) as { id: string; full_name: string }[]) names[p.id] = p.full_name;
  }

  return (
    <div className="mt-6">
      <p className="mb-4 text-sm text-ink-500">
        Changes to who has authority, and to who may collect a child. Written by
        database triggers rather than by the app, so it records what happened
        even if someone went at the API directly — and nothing can edit or
        delete an entry, including a Super_Admin.
      </p>

      {log.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-400">
          Nothing recorded yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {log.map((r) => (
            <li
              key={r.id}
              className={
                "rounded-lg border px-3 py-2.5 text-sm " +
                (SERIOUS.has(r.action) ? "border-brand-200 bg-brand-50" : "border-ink-100 bg-white")
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={
                    "font-medium " + (SERIOUS.has(r.action) ? "text-brand-800" : "text-ink-800")
                  }
                >
                  {LABELS[r.action] ?? r.action}
                </span>
                <span className="text-xs text-ink-400">
                  {new Date(r.created_at).toLocaleString()}
                </span>
                <span className="flex-1" />
                <span className="text-xs text-ink-500">
                  {r.user_id ? (names[r.user_id] ?? "Unknown") : "System"}
                </span>
              </div>
              <p className="mt-0.5 text-ink-600">{describe(r)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
