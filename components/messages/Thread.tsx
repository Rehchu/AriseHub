"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";
import { notifyMany, preview } from "@/lib/notify";
import { compressImage } from "@/lib/photos";

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
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    if (!text && !file) return;
    setSending(true);
    setBody("");
    setUploadError(null);

    // Upload the attachment first — a message referencing a file that failed
    // to upload would render as a broken image.
    let attachment: { url: string; type: string; name: string } | null = null;
    if (file) {
      try {
        const isImage = file.type.startsWith("image/");
        const blob = isImage ? await compressImage(file, 1400, 0.82) : file;
        const path = `messages/${channelId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("attachments").upload(path, blob, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
        if (error) throw error;
        const { data } = supabase.storage.from("attachments").getPublicUrl(path);
        attachment = { url: data.publicUrl, type: file.type || "file", name: file.name };
      } catch (err) {
        setSending(false);
        setBody(text);
        const msg = err instanceof Error ? err.message : "Upload failed";
        setUploadError(
          /bucket/i.test(msg)
            ? "File sharing isn't set up yet — create a public bucket named 'attachments' in Supabase."
            : msg,
        );
        return;
      }
    }
    // Insert and get the row back so we can show it immediately — don't wait on
    // the Realtime round-trip (and it works even if Realtime is momentarily off).
    const { data, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        sender_profile_id: currentProfileId,
        body: text || null,
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_name: attachment?.name ?? null,
      })
      .select("*")
      .single();
    setSending(false);
    if (error) {
      setBody(text); // restore on failure
      return;
    }
    setFile(null);
    setFilePreview(null);
    if (data) {
      const m = data as Message;
      const senderName = await nameFor(m.sender_profile_id);

      // Notify the other members of this channel. RLS scopes the read to
      // channels we belong to, so this can't leak membership elsewhere.
      const { data: members } = await supabase
        .from("channel_members")
        .select("profile_id")
        .eq("channel_id", channelId);
      const others = ((members ?? []) as { profile_id: string }[])
        .map((x) => x.profile_id)
        .filter((id) => id !== currentProfileId);
      notifyMany(
        others,
        kind === "department" ? title : senderName,
        (kind === "department" ? senderName + ": " : "") +
          (text ? preview(text) : attachment ? "📷 sent a photo" : ""),
        "/messages/" + channelId,
      );
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
    <div className="flex h-full w-full min-w-0 flex-col">
      <header className="flex items-center gap-2.5 border-b border-ink-100 bg-white px-4 py-3 sm:px-5">
        {/* Back to the channel list — only needed in the single-pane mobile view */}
        <a
          href="/messages"
          className="-ml-1 shrink-0 rounded-lg p-1 text-ink-500 hover:bg-ink-50 lg:hidden"
          aria-label="Back to conversations"
        >
          ←
        </a>
        <Icon name={kind === "department" ? "group" : "chat"} className="hidden shrink-0 text-ink-400 sm:block" />
        <h2 className="truncate font-display font-bold text-ink-900">{title}</h2>
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
                    <>
                      {m.attachment_url &&
                        (m.attachment_type?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={m.attachment_url}
                              alt={m.attachment_name ?? "attachment"}
                              className="mb-1 max-h-64 rounded-lg object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            href={m.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 text-xs underline"
                          >
                            <Icon name="form" size={14} />
                            {m.attachment_name ?? "Attachment"}
                          </a>
                        ))}
                      {m.body && (
                        <span className="whitespace-pre-wrap break-words">{m.body}</span>
                      )}
                    </>
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

      <div className="border-t border-ink-100 bg-white">
        {uploadError && (
          <p className="px-4 pt-2 text-xs text-brand-600">{uploadError}</p>
        )}
        {filePreview && (
          <div className="flex items-center gap-2 px-4 pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={filePreview} alt="" className="h-14 w-14 rounded-lg object-cover" />
            <span className="flex-1 truncate text-xs text-ink-500">{file?.name}</span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setFilePreview(null);
              }}
              className="text-ink-400 hover:text-brand-500"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
      <form onSubmit={send} className="flex items-end gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-ink-100 text-ink-600 hover:bg-ink-200">
          <Icon name="link" size={18} />
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFile(f);
              if (f.type.startsWith("image/")) {
                const r = new FileReader();
                r.onload = () => setFilePreview(String(r.result));
                r.readAsDataURL(f);
              } else setFilePreview(null);
            }}
          />
        </label>
        <textarea
          className="ah-input max-h-32 min-h-0 w-full flex-1 resize-none py-2"
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
          disabled={sending || (!body.trim() && !file)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-50"
          aria-label="Send"
        >
          <Icon name="send" />
        </button>
      </form>
      </div>
    </div>
  );
}
