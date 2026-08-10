"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export function SetPassword() {
  const supabase = createClient();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("The passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-ink-100 bg-white p-4 text-sm font-medium text-ink-700">
        <Icon name="check" size={18} />
        Password saved. Taking you Home…
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-ink-100 bg-white p-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-600">New password</span>
        <input
          type="password"
          className="ah-input"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-600">Confirm password</span>
        <input
          type="password"
          className="ah-input"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent py-2.5 font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
