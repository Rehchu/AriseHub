"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/Icon";
import { Modal } from "@/components/ui/Modal";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

const CATEGORIES = ["Account", "Hardware", "Software", "Network", "Other"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

export interface TicketMessage {
  senderName: string;
  body: string | null;
  created_at: string;
}

/**
 * Turn a support conversation into a ticket on the IT portal.
 *
 * The whole thread is copied into the description, so whoever picks it up in
 * the portal has the context without having to come back here and read it. The
 * conversation stays where it is — this copies, it does not move.
 */
export function MakeTicket({
  messages,
  requesterName,
  requesterEmail,
  onClose,
}: {
  messages: TicketMessage[];
  requesterName: string;
  requesterEmail: string;
  onClose: () => void;
}) {
  const transcript = messages
    .filter((m) => m.body?.trim())
    .map((m) => {
      const when = new Date(m.created_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      return `[${when}] ${m.senderName}: ${m.body!.trim()}`;
    })
    .join("\n");

  // First thing said is almost always the problem, so it makes a better subject
  // than "Support conversation".
  const firstLine = messages.find((m) => m.body?.trim())?.body?.trim() ?? "";
  const [subject, setSubject] = useState(
    firstLine.length > 72 ? firstLine.slice(0, 69) + "…" : firstLine || "Support request",
  );
  const [category, setCategory] = useState("Other");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const description =
      (notes.trim() ? notes.trim() + "\n\n" : "") +
      "--- Conversation from AriseHub ---\n" +
      transcript;
    try {
      const res = await fetch(`${IT_PORTAL}/api/public/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName,
          requesterEmail,
          category,
          priority,
          subject,
          description,
        }),
      });
      if (!res.ok) throw new Error(`The portal refused it (${res.status})`);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}. You can also raise it at ${IT_PORTAL}/request`
          : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Modal onClose={onClose} className="p-4" label="Ticket created">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            ✓
          </div>
          <h2 className="font-display text-lg font-bold text-ink-900">Ticket raised</h2>
          <p className="mt-1 text-sm text-ink-500">
            The conversation was copied into it. It stays here too.
          </p>
          <button
            onClick={onClose}
            className="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} align="start" className="p-4 pt-12" label="Make this a ticket">
      <form
        onSubmit={submit}
        className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
            <Icon name="help" /> Make this a ticket
          </h2>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-600">Subject</span>
          <input
            className="ah-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">Category</span>
            <select className="ah-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">Priority</span>
            <select className="ah-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-600">
            Anything to add <span className="font-normal text-ink-400">(optional)</span>
          </span>
          <textarea
            className="ah-input min-h-20"
            placeholder="Context that isn't in the conversation…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">
            Conversation to be copied in ({transcript ? messages.filter((m) => m.body?.trim()).length : 0} messages)
          </p>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
            {transcript || "Nothing to copy yet."}
          </pre>
        </div>

        {error && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !subject.trim()}
          className="w-full rounded-lg bg-accent py-2.5 font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Raising…" : "Raise the ticket"}
        </button>
      </form>
    </Modal>
  );
}
