"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">Forms</h1>
        <p className="mt-1 text-ink-500">
          Connect cards, sign-ups, and volunteer applications — share a link, no
          login needed for guests.
        </p>
      </div>

      <form onSubmit={create} className="mb-6 flex gap-2">
        <input
          className="ah-input"
          placeholder="New form title (e.g. Guest Connect Card)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          Create & edit
        </button>
      </form>
      {error && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {forms.map((f) => (
          <Link
            key={f.id}
            href={`/forms/${f.id}`}
            className="flex flex-col rounded-xl border border-ink-100 bg-white p-4 transition hover:shadow-md"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                <Icon name="form" />
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  f.is_active ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-400"
                }`}
              >
                {f.is_active ? "Active" : "Off"}
              </span>
            </div>
            <p className="mt-2 font-display font-semibold text-ink-900">{f.title}</p>
            <p className="mt-1 text-xs text-ink-500">
              {f.submissionCount} submission{f.submissionCount === 1 ? "" : "s"} · /f/{f.slug}
            </p>
          </Link>
        ))}
        {forms.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
            No forms yet — create your first Connect Card above.
          </p>
        )}
      </div>
    </div>
  );
}
