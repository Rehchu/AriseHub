"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

// Pick a person from the directory (RLS scopes this to people you're allowed to
// see) and open — or reuse — a 1:1 channel via the get_or_create_dm RPC.
export function NewDialog({
  currentProfileId,
  onClose,
}: {
  currentProfileId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .is("archived_at", null)
      .order("full_name")
      .limit(100)
      .then(({ data }) => setPeople((data ?? []) as typeof people));
  }, [supabase]);

  const filtered = people
    .filter((p) => p.id !== currentProfileId)
    .filter((p) => p.full_name.toLowerCase().includes(q.toLowerCase()));

  async function startDm(otherId: string) {
    setBusy(true);
    const { data, error } = await supabase.rpc("get_or_create_dm", {
      other_profile: otherId,
    });
    setBusy(false);
    if (error || !data) return;
    onClose();
    router.push(`/messages/${data}`);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="font-display font-bold">New message</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-3">
          <input
            autoFocus
            className="ah-input"
            placeholder="Search people…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-400">No people found.</p>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => startDm(p.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink-50 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {initials(p.full_name)}
              </span>
              <span className="flex-1">
                <span className="block font-medium text-ink-800">{p.full_name}</span>
                <span className="block text-xs text-ink-400">
                  {p.role.replace("_", " ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
