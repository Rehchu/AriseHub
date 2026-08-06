"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

interface Row extends Message {
  senderName: string;
}

export function Thread({
  channelId,
  currentProfileId,
  title,
  kind,
}: {
  channelId: string;
  currentProfileId: string;
  title: string;
  kind: "department" | "direct";
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const nameCache = useRef<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const nameFor = useCallback(
    async (profileId: string): Promise<string> => {
      if (nameCache.current[profileId]) return nameCache.current[profileId];
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", profileId)
        .maybeSingle();
      const name = data?.full_name ?? "Someone";
      nameCache.current[profileId] = name;
      return name;
    },
    [supabase],
  );

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*, profiles!messages_sender_profile_id_fkey(full_name)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      const mapped = (data ?? []).map((m: Record<string, unknown>) => {
        const sender = (m.profiles as { full_name: string } | null)?.full_name ?? "Someone";
        nameCache.current[m.sender_profile_id as string] = sender;
        return { ...(m as unknown as Message), senderName: sender };
      });
      setRows(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, channelId]);

  // Realtime: new/edited/deleted messages in this channel.
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const m = payload.new as Message;
            const senderName = await nameFor(m.sender_profile_id);
            setRows((prev) =>
              prev.some((r) => r.id === m.id) ? prev : [...prev, { ...m, senderName }],
            );
          } else if (payload.eventType === "UPDATE") {
            const m = payload.new as Message;
            setRows((prev) =>
              prev.map((r) => (r.id === m.id ? { ...r, ...m } : r)),
            );
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, channelId, nameFor]);

  // Auto-scroll to newest.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rows]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setBody("");
    // Insert and get the row back so we can show it immediately — don't wait on
    // the Realtime round-trip (and it works even if Realtime is momentarily off).
    const { data, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        sender_profile_id: currentProfileId,
        body: text,
      })
      .select("*")
      .single();
    setSending(false);
    if (error) {
      setBody(text); // restore on failure
      return;
    }
    if (data) {
      const m = data as Message;
      const senderName = await nameFor(m.sender_profile_id);
      setRows((prev) =>
        prev.some((r) => r.id === m.id) ? prev : [...prev, { ...m, senderName }],
      );
    }
  }

  async function softDelete(id: string) {
    await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2.5 border-b border-ink-100 bg-white px-5 py-3">
        <Icon name={kind === "department" ? "group" : "chat"} className="text-ink-400" />
        <h2 className="font-display font-bold text-ink-900">{title}</h2>
      </header>

      <div className="flex-1 space-y-1 overflow-y-auto bg-ink-50 px-4 py-4">
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-400">
            No messages yet — say hello 👋
          </p>
        )}
        {rows.map((m, i) => {
          const mine = m.sender_profile_id === currentProfileId;
          const showName =
            !mine && (i === 0 || rows[i - 1].sender_profile_id !== m.sender_profile_id);
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[75%]">
                {showName && (
                  <p className="mb-0.5 px-1 text-xs font-medium text-ink-500">
                    {m.senderName}
                  </p>
                )}
                <div
                  className={`group relative rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "bg-brand-500 text-white"
                      : "bg-white text-ink-800 shadow-sm"
                  }`}
                >
                  {m.deleted_at ? (
                    <span className="italic opacity-60">message deleted</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                  )}
                  {mine && !m.deleted_at && (
                    <button
                      onClick={() => softDelete(m.id)}
                      className="absolute -left-6 top-1/2 hidden -translate-y-1/2 text-ink-300 hover:text-brand-500 group-hover:block"
                      aria-label="Delete message"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-ink-100 bg-white px-4 py-3">
        <textarea
          className="ah-input max-h-32 min-h-0 resize-none py-2"
          rows={1}
          placeholder={`Message ${title}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-50"
          aria-label="Send"
        >
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
