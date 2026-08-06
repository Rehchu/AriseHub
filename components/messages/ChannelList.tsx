"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Channel, Profile } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";
import { NewDialog } from "./NewDialog";

interface ChannelRow {
  id: string;
  type: "department" | "direct";
  label: string;
}

export function ChannelList({
  currentProfileId,
}: {
  currentProfileId: string;
}) {
  const supabase = createClient();
  const pathname = usePathname();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    // RLS returns only channels the caller belongs to (plus all for admins).
    const { data: chans } = await supabase
      .from("channels")
      .select("id, type, department_id, title, created_at")
      .order("created_at");

    const list = (chans ?? []) as Channel[];

    // For direct channels, label = the other participant's name.
    const directIds = list.filter((c) => c.type === "direct").map((c) => c.id);
    const otherName: Record<string, string> = {};
    if (directIds.length) {
      const { data: members } = await supabase
        .from("channel_members")
        .select("channel_id, profile_id, profiles(full_name)")
        .in("channel_id", directIds);
      for (const m of (members ?? []) as unknown as {
        channel_id: string;
        profile_id: string;
        profiles: { full_name: string } | null;
      }[]) {
        if (m.profile_id !== currentProfileId && m.profiles) {
          otherName[m.channel_id] = m.profiles.full_name;
        }
      }
    }

    setChannels(
      list.map((c) => ({
        id: c.id,
        type: c.type,
        label:
          c.type === "department"
            ? (c.title ?? "Department")
            : (otherName[c.id] ?? "Direct message"),
      })),
    );
    setLoading(false);
  }, [supabase, currentProfileId]);

  useEffect(() => {
    load();
  }, [load]);

  const departments = channels.filter((c) => c.type === "department");
  const directs = channels.filter((c) => c.type === "direct");

  return (
    <>
      <aside className="flex w-full flex-col border-r border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="font-display font-bold text-ink-900">Messages</h2>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-lg p-1.5 text-brand-500 transition hover:bg-brand-50"
            aria-label="New direct message"
          >
            <Icon name="send" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {loading ? (
            <p className="px-3 text-sm text-ink-400">Loading…</p>
          ) : (
            <>
              <Section title="Department chats" rows={departments} pathname={pathname} icon="group" />
              <Section title="Direct messages" rows={directs} pathname={pathname} icon="chat" empty="No direct messages yet." />
            </>
          )}
        </div>
      </aside>

      {showNew && (
        <NewDialog
          currentProfileId={currentProfileId}
          onClose={() => setShowNew(false)}
        />
      )}
    </>
  );
}

function Section({
  title,
  rows,
  pathname,
  icon,
  empty,
}: {
  title: string;
  rows: ChannelRow[];
  pathname: string;
  icon: string;
  empty?: string;
}) {
  return (
    <div className="mb-4">
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        {title}
      </p>
      {rows.length === 0 && empty && (
        <p className="px-3 py-1 text-sm text-ink-400">{empty}</p>
      )}
      {rows.map((c) => {
        const active = pathname === `/messages/${c.id}`;
        return (
          <Link
            key={c.id}
            href={`/messages/${c.id}`}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-ink-700 hover:bg-ink-50"
            }`}
          >
            <Icon name={icon} size={18} className="text-ink-400" />
            <span className="truncate">{c.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

// exported for type reuse
export type { Profile };
