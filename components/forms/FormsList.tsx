"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface FormRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  submissionCount: number;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export function FormsList({
  initial,
  currentProfileId,
}: {
  initial: FormRow[];
  currentProfileId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [forms] = useState<FormRow[]>(initial);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const base = slugify(title) || "form";
    const slug = `${base}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const { data, error } = await supabase
      .from("forms")
      .insert({ title: title.trim(), slug, created_by: currentProfileId })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      setError(error?.message ?? "Could not create form.");
      return;
    }
    router.push(`/forms/${(data as { id: string }).id}`);
  }

  const activeCount = forms.filter((f) => f.is_active).length;
  const responseTotal = forms.reduce((s, f) => s + f.submissionCount, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink-100 pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold text-ink-900">Forms</h1>
          <p className="text-sm text-ink-500">
            share a link — no login needed for guests
          </p>
        </div>
        <form onSubmit={create} className="flex flex-wrap gap-2 sm:ml-auto">
          <input
            className="ah-input max-w-xs"
            placeholder="New form title (e.g. Guest Connect Card)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-strong disabled:opacity-60"
          >
            Create &amp; edit
          </button>
        </form>
      </div>
      {error && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      {forms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
          No forms yet — create your first Connect Card above.
        </p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left">
              <Th className="w-[46%]">Form</Th>
              <Th className="hidden w-[24%] md:table-cell">Link</Th>
              <Th className="w-[16%]">Responses</Th>
              <Th className="w-[14%]">Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {forms.map((f) => (
              <tr key={f.id} className="transition hover:bg-white">
                <td className="px-2 py-2">
                  <Link href={`/forms/${f.id}`} className="block min-w-0">
                    <p className="truncate font-semibold text-ink-900">{f.title}</p>
                    <p className="truncate text-xs text-ink-400 md:hidden">/f/{f.slug}</p>
                  </Link>
                </td>
                <td className="hidden truncate px-2 py-2 text-xs text-ink-500 md:table-cell">
                  /f/{f.slug}
                </td>
                <td className="px-2 py-2 text-ink-500">{f.submissionCount}</td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      f.is_active ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {f.is_active ? "Active" : "Off"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {forms.length > 0 && (
        <div className="mt-6 grid divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell kicker="Forms" value={String(forms.length)} note="connect cards & sign-ups" />
          <StatCell
            kicker="Active"
            value={String(activeCount)}
            note={activeCount === forms.length ? "all collecting" : `${forms.length - activeCount} switched off`}
          />
          <StatCell
            kicker="Responses"
            value={String(responseTotal)}
            note="across forms you manage"
          />
        </div>
      )}
    </div>
  );
}

function Th({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <th className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400 ${className}`}>
      {children}
    </th>
  );
}

function StatCell({ kicker, value, note }: { kicker: string; value: string; note: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{kicker}</p>
      <p className="mt-0.5 font-display text-[26px] font-bold leading-8 text-ink-900">{value}</p>
      <p className="truncate text-xs text-ink-500">{note}</p>
    </div>
  );
}
