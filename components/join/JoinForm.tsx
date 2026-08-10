"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/Turnstile";

/**
 * Self-registration via an invite link. Creation happens server-side
 * (/api/join) because public signup is disabled; on success we sign the person
 * in straight away so they land in the app rather than at a login screen.
 */
export function JoinForm({
  code,
  label,
  campusName,
}: {
  code: string;
  label: string;
  campusName: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the server recognises them as an existing member: the account is
  // created but held unconfirmed until they click the emailed link, so there's
  // no instant sign-in for this branch.
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);

    // Unguarded, this left the button reading "Creating your account…" forever
    // on a dropped connection — and this is somebody's first minute in the app,
    // on church wifi, with no way to tell whether an account now exists. The
    // route is idempotent enough to retry: a duplicate email is refused with a
    // clear message rather than creating a second account.
    let res: Response;
    try {
      res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email, password, fullName, turnstileToken }),
      });
    } catch {
      setBusy(false);
      setError("Couldn't reach AriseHub — check your connection and try again.");
      return;
    }
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      pendingVerification?: boolean;
    };

    if (!res.ok) {
      setBusy(false);
      setError(j.error ?? "Could not create your account.");
      return;
    }

    // Existing member: they must confirm by email before the account activates
    // and their records connect. No sign-in attempt — it would fail unconfirmed.
    if (j.pendingVerification) {
      setBusy(false);
      setCheckEmail(true);
      return;
    }

    // Sign them in immediately — no second step.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (signInErr) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="space-y-3 rounded-xl border border-ink-100 bg-white p-6 text-center">
        <h2 className="font-display text-lg font-bold text-ink-900">Check your email</h2>
        <p className="text-sm text-ink-600">
          You&apos;re already on file with the church, so we sent a confirmation link to{" "}
          <span className="font-medium text-ink-900">{email.trim().toLowerCase()}</span>. Open it
          to activate your account and connect your existing records.
        </p>
        <p className="text-xs text-ink-400">
          Didn&apos;t get it? Check spam, or ask your leader to finish setting you up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-ink-100 bg-white p-6">
      <div>
        <h2 className="font-display text-lg font-bold text-ink-900">Create your account</h2>
        <p className="mt-1 text-sm text-ink-500">
          {label}
          {campusName ? ` · ${campusName}` : ""}
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-600">Full name</span>
        <input
          className="ah-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-600">Email</span>
        <input
          type="email"
          className="ah-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-600">Password</span>
        <input
          type="password"
          className="ah-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <span className="mt-1 block text-xs text-ink-400">At least 8 characters.</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-600">Confirm password</span>
        <input
          type="password"
          className="ah-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
      </label>

      <Turnstile onToken={setTurnstileToken} />

      {error && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent py-2.5 font-semibold text-onaccent transition hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? "Creating your account…" : "Join AriseHub"}
      </button>

      <p className="text-center text-xs text-ink-400">
        Already have an account?{" "}
        <a href="/login" className="font-medium text-brand-600 underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
