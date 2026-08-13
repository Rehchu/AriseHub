"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/** A headword in the list. */
interface Listing {
  slug: string;
  name: string;
  sources: string[];
}

/** A full article, with everywhere it cites. */
interface Article extends Listing {
  definitions: { source: string; text: string }[];
  dictionary_refs: { book: string; chapter: number; verse: number | null; original: string | null }[];
}

const DICTIONARY_NAMES: Record<string, string> = {
  EAS: "Easton's Bible Dictionary (1897)",
  SMI: "Smith's Bible Dictionary (1863)",
};

const LETTERS = "abcdefghijklmnopqrstuvwyz".split("");

export function DictionaryBrowser() {
  const [term, setTerm] = useState("");
  const [letter, setLetter] = useState("a");
  const [listing, setListing] = useState<Listing[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [credit, setCredit] = useState<string | null>(null);

  // Same guard the reader uses: typing fires a request per keystroke, and
  // without this a slow early one can land on top of a later, better result.
  const seqRef = useRef(0);

  const load = useCallback(async (params: string) => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/bible/dictionary?${params}`);
      const d = await res.json();
      if (seq !== seqRef.current) return;
      setListing(d.entries ?? []);
      setCredit(d.attribution ?? null);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = term.trim();
    // Debounced so a typed word is one request, not eight.
    const id = setTimeout(
      () => load(t ? `q=${encodeURIComponent(t)}` : `letter=${letter}`),
      t ? 220 : 0,
    );
    return () => clearTimeout(id);
  }, [term, letter, load]);

  async function open(slug: string) {
    const res = await fetch(`/api/bible/dictionary?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const d = await res.json();
    setArticle(d.entry);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">Bible dictionary</h1>
        <Link href="/bible" className="text-sm text-brand-600 underline">
          Back to the reader
        </Link>
      </header>

      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <label className="block">
          <span className="sr-only">Search the dictionary</span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search a word — shepherd, passover, centurion…"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-ink-900 placeholder:text-ink-400"
          />
        </label>

        {!term.trim() && (
          <div className="mt-3 flex flex-wrap gap-1">
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLetter(l)}
                className={
                  "h-7 w-7 rounded text-sm font-semibold uppercase " +
                  // text-onaccent is the foreground half of the accent pair and
                  // never inverts. The plain white token is the dark-mode card
                  // surface, so using it here would go dark-on-dark at night.
                  (l === letter ? "bg-brand-500 text-onaccent" : "text-ink-600 hover:bg-ink-100")
                }
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <nav className="rounded-xl border border-ink-100 bg-white p-2" aria-label="Entries">
          {loading && <p className="p-2 text-sm text-ink-400">Loading…</p>}
          {!loading && listing.length === 0 && (
            <p className="p-2 text-sm text-ink-400">Nothing found.</p>
          )}
          <ul className="max-h-[32rem] overflow-y-auto">
            {listing.map((e) => (
              <li key={e.slug}>
                <button
                  type="button"
                  onClick={() => open(e.slug)}
                  className={
                    "w-full rounded px-2 py-1.5 text-left text-sm " +
                    (article?.slug === e.slug
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-ink-700 hover:bg-ink-50")
                  }
                >
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <article className="rounded-xl border border-ink-100 bg-white p-5">
          {!article && (
            <p className="text-sm text-ink-400">
              Pick a word to read the full article. Both dictionaries are shown when both define
              it — they often disagree, which is half the value.
            </p>
          )}

          {article && (
            <>
              <h2 className="font-display text-xl font-bold text-ink-900">{article.name}</h2>

              {article.definitions.map((d, i) => (
                <section key={i} className="mt-4">
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">
                    {DICTIONARY_NAMES[d.source] ?? d.source}
                  </h3>
                  <p className="whitespace-pre-line leading-relaxed text-ink-800">{d.text}</p>
                </section>
              ))}

              {article.dictionary_refs?.length > 0 && (
                <section className="mt-5 rounded-lg border border-ink-100 bg-ink-50 p-4">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                    Scriptures cited
                  </h3>
                  {/* Each opens the reader on that passage, so a word study can
                      run straight back into the text rather than dead-ending. */}
                  <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {article.dictionary_refs.map((r, i) => {
                      const ref = `${r.book} ${r.chapter}${r.verse ? `:${r.verse}` : ""}`;
                      return (
                        <li key={i}>
                          <Link
                            href={`/bible?ref=${encodeURIComponent(ref)}`}
                            className="text-sm text-brand-600 underline decoration-dotted underline-offset-2"
                          >
                            {r.original || ref}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </>
          )}

          {credit && <p className="mt-5 text-xs text-ink-400">{credit}</p>}
        </article>
      </div>
    </div>
  );
}
