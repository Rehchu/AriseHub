"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/shell/Icon";

interface KeyRecord {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
}

const EXPIRY_CHOICES = [30, 90, 180, 365] as const;

function statusOf(k: KeyRecord): "revoked" | "expired" | "active" {
  if (k.revoked_at) return "revoked";
  if (k.expires_at && new Date(k.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * Personal API keys for an agent that acts as you.
 *
 * The plaintext appears exactly once, in the panel shown right after creation.
 * Only a hash is stored, so a lost key is replaced, never recovered.
 */
export function ApiKeysAdmin() {
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState<number>(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/api-keys", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []))
      .catch(() => setError("Couldn't load your keys."))
      .finally(() => setLoaded(true));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), expiresInDays: days }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Couldn't create the key.");
    setKeys((ks) => [d.record as KeyRecord, ...ks]);
    setFresh({ key: d.key as string, name: name.trim() });
    setCopied(false);
    setName("");
  }

  async function revoke(k: KeyRecord) {
    if (
      !window.confirm(
        `Revoke "${k.name}"? The agent can't start new sessions with it. A session it already has keeps working until it expires — at most an hour.`,
      )
    )
      return;
    const res = await fetch(`/api/api-keys/${k.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setError(d.error ?? "Couldn't revoke the key.");
    setKeys((ks) => ks.map((x) => (x.id === k.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <h2 className="flex items-center gap-2 font-medium text-ink-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-onaccent">
            <Icon name="link" size={18} />
          </span>
          API keys
        </h2>
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
          A key lets an agent act as <strong>you</strong> — in AriseHub and in the IT portal —
          with exactly your permissions, no more. Treat it like your password: anyone holding
          it can do anything you can. It&apos;s shown once, then only a fingerprint is kept.
          Revoke it the moment you stop using it.
        </p>

        <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">Name</span>
            <input
              className="ah-input"
              placeholder="My assistant"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">Expires after</span>
            <select className="ah-input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {EXPIRY_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create key"}
          </button>
        </form>

        {error && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

        {fresh && (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <p className="text-sm font-semibold text-ink-900">
              Copy &ldquo;{fresh.name}&rdquo; now — it won&apos;t be shown again.
            </p>
            <div className="mt-2 flex gap-2">
              <input readOnly className="ah-input font-mono text-xs" value={fresh.key} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(fresh.key);
                  setCopied(true);
                }}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-onaccent"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-600">
              Give it to the agent privately — its own secret settings, not a chat message. The
              agent sends it to <code className="font-mono">POST /api/agent/token</code> for a
              one-hour session and uses that for everything else.
            </p>
            <button type="button" onClick={() => setFresh(null)} className="mt-2 text-xs font-medium text-ink-600 underline">
              I&apos;ve saved it
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        {!loaded ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {keys.map((k) => {
              const status = statusOf(k);
              return (
                <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="text-sm font-semibold text-ink-900">{k.name}</span>
                  <code className="font-mono text-xs text-ink-500">{k.prefix}…</code>
                  {status !== "active" && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                      {status}
                    </span>
                  )}
                  <span className="flex-1" />
                  <span className="text-xs text-ink-400">
                    {k.last_used_at ? `Last used ${fmt(k.last_used_at)}` : "Never used"}
                    {k.expires_at && status === "active" && ` · expires ${fmt(k.expires_at)}`}
                  </span>
                  {status === "active" && (
                    <button onClick={() => revoke(k)} className="text-xs font-medium text-brand-700 underline">
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
