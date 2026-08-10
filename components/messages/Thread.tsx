"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";
import { notifyMany, preview } from "@/lib/notify";
import { SignedAttachment } from "./SignedAttachment";
import { uploadToR2 } from "@/lib/upload";
import { compressImage } from "@/lib/photos";
import { MakeTicket } from "./MakeTicket";

interface Row extends Message {
  senderName: string;
}

/** Consecutive messages from one author inside this window share a header. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** "9:41 AM" today, "Aug 7 · 9:41 AM" before that. */
function stamp(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

export function Thread({
  channelId,
  currentProfileId,
  title,
  kind,
  requesterName = "",
  requesterEmail = "",
}: {
  channelId: string;
  currentProfileId: string;
  title: string;
  kind: "department" | "direct" | "support";
  requesterName?: string;
  requesterEmail?: string;
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
  /** Guards against a second Enter landing while the first send is in flight. */
  const inFlight = useRef(false);
  const [ticketOpen, setTicketOpen] = useState(false);

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
      // Newest 200, then reversed for display.
      //
      // This ordered ASCENDING with limit(200), and Postgres applies LIMIT
      // after ORDER BY — so it fetched the 200 OLDEST messages in the channel.
      // Once a department chat passed 200 messages the thread would show its
      // first ever conversation and nothing since, with no indication why.
      const { data } = await supabase
        .from("messages")
        .select("*, profiles!messages_sender_profile_id_fkey(full_name)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      const mapped = (data ?? []).reverse().map((m: Record<string, unknown>) => {
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
    // `sending` is set below, but React batches state and this function is also
    // reachable from Enter in the textarea — which stays focused and accepts a
    // second Enter while the attachment is still uploading. Two presses sent
    // the photo twice. A ref settles synchronously, so the second call returns
    // here.
    if (inFlight.current) return;
    inFlight.current = true;
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
        // R2, via our own route: every read is checked against the session, so
        // someone removed from the channel loses the file immediately rather
        // than when a signature happens to expire.
        const up = await uploadToR2(blob, `messages/${channelId}`, file.name);
        if ("error" in up) throw new Error(up.error);
        attachment = { url: up.ref, type: file.type || "file", name: file.name };
      } catch (err) {
        inFlight.current = false;
        setSending(false);
        setBody(text);
        const msg = err instanceof Error ? err.message : "Upload failed";
        setUploadError(
          /bucket/i.test(msg)
            ? "File sharing isn't set up yet — create a private bucket named 'attachments' in Supabase."
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
    inFlight.current = false;
    setSending(false);
    if (error) {
      // Restoring the text was the ONLY signal that anything went wrong: the
      // message vanished, reappeared a moment later, and nothing said why. You
      // cannot tell that from a slow send, so you either send it twice or walk
      // away believing it went out.
      setBody(text);
      setUploadError(error.message || "Couldn't send that — tap send to try again.");
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
    if (!window.confirm("Delete this message? Everyone in the conversation will see it removed."))
      return;
    // Authoritative, and applied locally. This fired and forgot: if the write
    // was rejected the bubble just sat there unchanged, so you tapped the x
    // again and again with no idea whether it had registered — while the
    // message stayed visible to everyone else.
    const { data, error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, deleted_at")
      .maybeSingle();
    if (error || !data) {
      setUploadError(error?.message ?? "Couldn't delete that message — try again.");
      return;
    }
    const row = data as { id: string; deleted_at: string };
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, deleted_at: row.deleted_at } : r)));
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <header className="flex items-center gap-2.5 border-b border-ink-100 bg-white px-4 py-3 sm:px-5">
        {/* Back to the channel list — only needed in the single-pane mobile view */}
        <a
          href="/messages"
          className="-my-2.5 -ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-50 lg:hidden"
          aria-label="Back to conversations"
        >
          ←
        </a>
        <Icon
          name={kind === "department" ? "group" : kind === "support" ? "help" : "chat"}
          className="hidden shrink-0 text-ink-400 sm:block"
        />
        <h2 className="truncate font-display font-bold text-ink-900">{title}</h2>
        {kind === "support" && (
          <>
            <span className="flex-1" />
            <span className="hidden text-xs text-ink-400 sm:inline">Private</span>
            <button
              onClick={() => setTicketOpen(true)}
              className="shrink-0 rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-200"
            >
              Make a ticket
            </button>
          </>
        )}
      </header>

      {ticketOpen && (
        <MakeTicket
          messages={rows.map((r) => ({
            senderName: r.senderName,
            body: r.body,
            created_at: r.created_at,
          }))}
          requesterName={requesterName}
          requesterEmail={requesterEmail}
          onClose={() => setTicketOpen(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto bg-ink-50 px-4 py-4">
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-400">
            No messages yet — say hello 👋
          </p>
        )}
        {rows.map((m, i) => {
          const mine = m.sender_profile_id === currentProfileId;
          // One header per run of messages from the same author within the
          // grouping window; the rest hang under it, indented past the avatar.
          const prev = i > 0 ? rows[i - 1] : null;
          const grouped =
            !!prev &&
            prev.sender_profile_id === m.sender_profile_id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <
              GROUP_WINDOW_MS;
          return (
            <div
              key={m.id}
              className={`group flex items-start gap-2.5 ${grouped ? "mt-0.5" : "mt-4 first:mt-0"}`}
            >
              {grouped ? (
                <span className="w-8 shrink-0" aria-hidden="true" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-700">
                  {initials(m.senderName)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="flex items-baseline gap-2">
                    <span className="truncate text-[13.5px] font-semibold leading-5 text-ink-900">
                      {m.senderName}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {stamp(m.created_at)}
                    </span>
                  </p>
                )}
                {m.deleted_at ? (
                  <p className="text-sm italic leading-[1.5] text-ink-400">
                    message deleted
                  </p>
                ) : (
                  <div className="text-sm leading-[1.5] text-ink-700">
                    {m.attachment_url && (
                      <SignedAttachment
                        pathOrUrl={m.attachment_url}
                        type={m.attachment_type}
                        name={m.attachment_name}
                      />
                    )}
                    {m.body && (
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    )}
                  </div>
                )}
              </div>
              {mine && !m.deleted_at && (
                // `hidden … group-hover:block` meant this only ever existed on
                // a mouse — on a phone, which is where the app mostly gets
                // used, you could not delete your own message at all. Always
                // present, faded until hover/focus.
                <button
                  onClick={() => softDelete(m.id)}
                  className="ah-tight -m-2.5 flex shrink-0 items-center justify-center rounded-md p-2.5 text-ink-400 opacity-50 transition hover:bg-ink-100 hover:text-ink-700 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label="Delete message"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="bg-ink-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-4">
        {uploadError && (
          <p className="px-1 pb-1.5 text-xs text-brand-700">{uploadError}</p>
        )}
        {/* One bordered surface; everything inside it is borderless. */}
        <form onSubmit={send} className="rounded-xl border border-ink-100 bg-white">
          {file && (
            <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
              {filePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filePreview} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <span className="flex-1 truncate text-xs text-ink-500">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setFilePreview(null);
                }}
                className="ah-tight flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Remove attachment"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1 px-1.5 py-1.5">
            <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-50 hover:text-ink-700">
              <Icon name="link" size={17} />
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
              className="max-h-32 min-h-0 w-full flex-1 resize-none bg-transparent px-1.5 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400"
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-onaccent transition hover:bg-accent-strong disabled:opacity-50"
              aria-label="Send"
            >
              <Icon name="send" size={17} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
