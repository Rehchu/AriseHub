"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/shell/Icon";
import type { Passage, Translation } from "@/lib/bible";

const DEFAULT_REF = "John 3:16-17";
const DEFAULT_TRANSLATION = "BSB"; // Berean Standard Bible (keyless, modern)

export function BibleReader() {
  const [ref, setRef] = useState(DEFAULT_REF);
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paraphrase, setParaphrase] = useState<string | null>(null);
  const [simplifying, setSimplifying] = useState(false);

  // Translation list (once).
  useEffect(() => {
    fetch("/api/bible/translations")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.translations)) setTranslations(d.translations);
      })
      .catch(() => {});
  }, []);

  const lookup = useCallback(async (r: string, t: string) => {
    const q = r.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setParaphrase(null);
    try {
      const res = await fetch(
        `/api/bible/passage?ref=${encodeURIComponent(q)}&translation=${encodeURIComponent(t)}`,
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't find that passage");
      setPassage(d as Passage);
    } catch (e) {
      setPassage(null);
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Show something on first load.
  useEffect(() => {
    void lookup(DEFAULT_REF, DEFAULT_TRANSLATION);
  }, [lookup]);

  async function simplify() {
    if (!passage) return;
    setSimplifying(true);
    setParaphrase(null);
    setError(null);
    try {
      const res = await fetch("/api/bible/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: passage.reference, text: passage.text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't simplify that");
      setParaphrase(d.paraphrase as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simplify failed");
    } finally {
      setSimplifying(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-ink-900">Bible</h1>
      <p className="mb-4 text-sm text-ink-500">
        Read a passage — or tap Simplify for a plain-language explanation alongside it.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(ref, translation);
        }}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="e.g. John 3:16-17, Psalm 23, Romans 8"
          aria-label="Passage reference"
          className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
        />
        <select
          value={translation}
          onChange={(e) => {
            setTranslation(e.target.value);
            void lookup(ref, e.target.value);
          }}
          aria-label="Translation"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900"
        >
          {translations.length === 0 && <option value="BSB">Berean Standard Bible</option>}
          {translations.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-strong"
        >
          <Icon name="search" size={16} />
          Read
        </button>
      </form>

      {loading && <p className="text-sm text-ink-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {passage && !loading && (
        <article className="rounded-xl border border-ink-100 bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-ink-900">{passage.reference}</h2>
            <span className="shrink-0 text-xs text-ink-400">{passage.translationName}</span>
          </div>

          <div className="space-y-1.5 leading-relaxed text-ink-800">
            {passage.verses.map((v) => (
              <p key={`${v.chapter}:${v.verse}`}>
                <sup className="mr-1 align-super text-xs font-semibold text-brand-500">{v.verse}</sup>
                {v.text}
              </p>
            ))}
          </div>

          {passage.copyright && <p className="mt-3 text-xs text-ink-400">{passage.copyright}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
            <button
              onClick={simplify}
              disabled={simplifying}
              className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 disabled:opacity-50"
            >
              <Icon name="help" size={16} />
              {simplifying ? "Simplifying…" : "Simplify"}
            </button>
            <span className="text-xs text-ink-400">Plain-language explanation of this passage</span>
          </div>

          {paraphrase && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                Plain-language paraphrase — not scripture
              </p>
              <p className="text-sm leading-relaxed text-amber-900">{paraphrase}</p>
              <p className="mt-2 text-xs text-amber-600">
                An AI restatement to aid understanding. Always read it alongside the verse above.
              </p>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
