"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/Icon";

interface Person {
  id: string;
  full_name: string;
  email: string | null;
}

interface ResetResult {
  emailed: boolean;
  resetUrl?: string;
  emailError?: string;
  name: string;
  email: string;
}

/**
 * Send a password reset on someone's behalf. IT never sees or sets the
 * password — Supabase issues a one-time link and the person chooses their own.
 */
export function PasswordResetTool({ people }: { people: Person[] }) {
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = q.trim()
    ? people.filter((p) =>
        `${p.full_name} ${p.email ?? ""}`.toLowerCase().includes(q.toLowerCase()),
      )
    : people;

  async function reset(p: Person) {
    if (!p.email) {
      setError(`${p.full_name} has no email address on file.`);
      return;
    }
    if (
      !window.confirm(
        `Send a password reset email to ${p.full_name} (${p.email})?\n\nTheir current password keeps working until they use the link.`,
      )
    )
      return;

    setBusyId(p.id);
    setError(null);
    setResult(null);

    const res = await fetch("/api/it/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: p.email }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      emailed?: boolean;
      resetUrl?: string;
      emailError?: string;
      error?: string;
      detail?: string;
    };
    setBusyId(null);

    if (!res.ok) {
      setError(j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ""}` : "Reset failed.");
      return;
    }
    setResult({
      emailed: !!j.emailed,
      resetUrl: j.resetUrl,
      emailError: j.emailError,
      name: p.full_name,
      email: p.email,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <a
        href="/it"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600"
      >
        ← IT
      </a>
      <h1 className="font-display text-2xl font-bold text-ink-900">Password resets</h1>
      <p className="mt-1 text-ink-500">
        Send someone a link to choose a new password. You never see their password.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      {result && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4">
          {result.emailed ? (
            <p className="text-sm font-medium text-emerald-800">
              Reset email sent to {result.name} ({result.email}).
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-emerald-800">
                Reset link created for {result.name}. Email didn&apos;t send
                {result.emailError ? ` (${result.emailError})` : ""} — send them this
                link directly:
              </p>
              {result.resetUrl && (
                <div className="mt-2 flex gap-2">
                  <input readOnly className="ah-input text-xs" value={result.resetUrl} />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result.resetUrl!);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <input
        className="ah-input mt-6 max-w-sm"
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 bg-white">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
              {p.full_name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink-900">{p.full_name}</p>
              <p className="truncate text-xs text-ink-400">{p.email ?? "no email"}</p>
            </div>
            <button
              onClick={() => reset(p)}
              disabled={busyId === p.id || !p.email}
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busyId === p.id ? "Sending…" : "Send reset"}
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-400">
            No one matches that search.
          </p>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-500">
        <Icon name="help" size={14} className="mt-0.5 shrink-0" />
        Only people with an AriseHub login appear here. Children and non-login
        members registered at check-in don&apos;t have passwords.
      </p>
    </div>
  );
}
