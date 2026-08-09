"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

// AriseHub is invite-only: accounts are created by an admin (Admin → People →
// Invite someone). Flip this to true only if public self-signup is re-enabled
// in Supabase Auth as well — hiding the tab alone would not be a control.
const ALLOW_SIGNUP = false;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setNotice(
          "Account created. If email confirmation is on, check your inbox — then sign in.",
        );
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    /* chrome-900, not ink-900. The ink scale INVERTS, so this hero turned
       near-white in dark mode while text-onaccent stayed white — the wordmark
       and the whole sign-in heading vanished. chrome-* exists for exactly this:
       a surface that stays dark in both themes. */
    <div className="flex min-h-screen items-center justify-center bg-chrome-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-chrome-50">
          <Logo size={56} />
          <h1 className="font-display text-2xl font-bold">
            Arise<span className="text-brand-500">Hub</span>
          </h1>
          <p className="text-sm text-chrome-300">Arise Church · Pineville, LA</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-xl"
        >
          {ALLOW_SIGNUP && (
          <div className="flex rounded-lg bg-ink-100 p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 ${
                mode === "signin" ? "bg-white shadow-sm" : "text-ink-500"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-1.5 ${
                mode === "signup" ? "bg-white shadow-sm" : "text-ink-500"
              }`}
            >
              Create account
            </button>
          </div>
          )}

          {mode === "signup" && (
            <Field label="Full name">
              <input
                className="ah-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </Field>
          )}

          <Field label="Email">
            <input
              className="ah-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>

          <Field label="Password">
            <input
              className="ah-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              minLength={8}
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2.5 font-semibold text-onaccent transition hover:bg-accent-strong disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-600">
        {label}
      </span>
      {children}
    </label>
  );
}
