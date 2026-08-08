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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);

    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, email, password, fullName, turnstileToken }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      setBusy(false);
      setError(j.error ?? "Could not create your account.");
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

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
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
