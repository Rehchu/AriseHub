"use client";

import { useState } from "react";
import type { Profile } from "@/lib/database.types";
import { Icon } from "./Icon";

// The "easier support ticket" requirement: a logged-in user opens this, and
// their name + email are already filled from their profile — they just describe
// the problem. It posts to the live Arise-IT public ticket API. (Phase 2's auth
// bridge will upgrade this to an authenticated POST attributed to the D1 user;
// until then the public endpoint carries the prefilled identity.)
const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

const CATEGORIES = ["hardware", "software", "network", "account", "other"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

export function GetITHelp({
  profile,
  email,
  onClose,
}: {
  profile: Profile | null;
  email: string;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("hardware");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = profile?.full_name || email;
  const contactEmail = profile?.email || email;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${IT_PORTAL}/api/public/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName: name,
          requesterEmail: contactEmail,
          category,
          priority,
          subject,
          description,
          website, // honeypot — server drops if filled
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}. You can also submit at ${IT_PORTAL}/request`
          : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Icon name="help" /> Get IT Help
          </h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              ✓
            </div>
            <p className="font-medium">Your request was sent to Arise IT.</p>
            <p className="text-sm text-ink-500">
              We&apos;ll email {contactEmail} with updates.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 p-5">
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
              Submitting as <span className="font-medium">{name}</span> ·{" "}
              {contactEmail}
            </p>

            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-600">
                What&apos;s the problem?
              </span>
              <input
                className="ah-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Sanctuary projector won't connect"
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-600">
                  Category
                </span>
                <select
                  className="ah-input capitalize"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-600">
                  Urgency
                </span>
                <select
                  className="ah-input capitalize"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p} className="capitalize">
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-600">
                Details
              </span>
              <textarea
                className="ah-input min-h-24"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened, what you've tried, where the device is…"
                required
              />
            </label>

            {error && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send to Arise IT"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
