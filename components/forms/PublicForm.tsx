"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/Turnstile";

export interface PublicField {
  id: string;
  label: string;
  field_type: "text" | "textarea" | "email" | "phone" | "select" | "checkbox" | "date";
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export function PublicForm({
  formId,
  title,
  description,
  fields,
}: {
  formId: string;
  title: string;
  description: string | null;
  fields: PublicField[];
}) {
  const supabase = createClient();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(label: string, v: string | boolean) {
    setValues((prev) => ({ ...prev, [label]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Guess a name field for the convenience column.
    const nameKey = fields.find((f) => /name/i.test(f.label))?.label;
    const submitter_name = nameKey ? String(values[nameKey] ?? "") : null;

    // Through the API rather than straight to PostgREST, so the Turnstile
    // token is actually verified. It used to be collected into state and never
    // sent, which made the bot protection decorative.
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId,
          submitterName: submitter_name,
          data: values,
          turnstileToken,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setBusy(false);
      if (!res.ok) {
        setError(json.error ?? "Sorry — something went wrong. Please try again.");
        return;
      }
    } catch {
      setBusy(false);
      setError("Couldn't reach the server. Check your connection and try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          ✓
        </div>
        <h1 className="font-display text-xl font-bold text-ink-900">Thank you!</h1>
        <p className="mt-1 text-sm text-ink-500">Your response has been received.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h1 className="font-display text-xl font-bold text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>

      {fields.map((f) => (
        <div key={f.id}>
          {f.field_type !== "checkbox" && (
            <label className="mb-1 block text-sm font-medium text-ink-600">
              {f.label}
              {f.required && <span className="text-brand-500"> *</span>}
            </label>
          )}
          {f.field_type === "textarea" ? (
            <textarea
              className="ah-input min-h-24"
              required={f.required}
              onChange={(e) => set(f.label, e.target.value)}
            />
          ) : f.field_type === "select" ? (
            <select
              className="ah-input"
              required={f.required}
              defaultValue=""
              onChange={(e) => set(f.label, e.target.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.field_type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                onChange={(e) => set(f.label, e.target.checked)}
              />
              {f.label}
              {f.required && <span className="text-brand-500"> *</span>}
            </label>
          ) : (
            <input
              type={
                f.field_type === "email"
                  ? "email"
                  : f.field_type === "phone"
                    ? "tel"
                    : f.field_type === "date"
                      ? "date"
                      : "text"
              }
              className="ah-input"
              required={f.required}
              onChange={(e) => set(f.label, e.target.value)}
            />
          )}
        </div>
      ))}

      {fields.length === 0 && (
        <p className="text-sm text-ink-400">This form has no questions yet.</p>
      )}

      <Turnstile onToken={setTurnstileToken} />

      {error && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy || fields.length === 0}
        className="w-full rounded-lg bg-accent py-2.5 font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
