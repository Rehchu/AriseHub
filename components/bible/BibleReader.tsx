"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shell/Icon";
import type { BookInfo, MergedTranslation, Passage } from "@/lib/bible";

const DEFAULT_TRANSLATION = "BSB"; // Berean Standard Bible (keyless, modern)
const DEFAULT_BOOK = "JHN";
const DEFAULT_CHAPTER = 3;

/** A dictionary article that cites the passage on screen. */
interface DictionaryEntry {
  slug: string;
  name: string;
  sources: string[];
  verses: number[];
  excerpt: string;
}

/** Which dictionary a definition came from. */
const DICTIONARY_NAMES: Record<string, string> = {
  EAS: "Easton's",
  SMI: "Smith's",
};

export function BibleReader() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [book, setBook] = useState(DEFAULT_BOOK);
  const [chapter, setChapter] = useState(DEFAULT_CHAPTER);
  // A ?ref= in the URL wins over the default. The dictionary links back this
  // way, so a word study can run from an article straight into the passage it
  // cites. Read once, at first render, rather than in an effect that would
  // paint John 3 and then jump.
  const [ref, setRef] = useState(() => {
    if (typeof window === "undefined") return "John 3";
    return new URLSearchParams(window.location.search).get("ref")?.trim() || "John 3";
  });
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [translations, setTranslations] = useState<MergedTranslation[]>([]);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paraphrase, setParaphrase] = useState<string | null>(null);
  const [simplifying, setSimplifying] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Which narrator's recording is selected, when a chapter has several. */
  const [narrator, setNarrator] = useState(0);
  /** Dictionary entries that cite the passage on screen. */
  const [references, setReferences] = useState<DictionaryEntry[]>([]);
  const [referenceCredit, setReferenceCredit] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const booksRef = useRef<BookInfo[]>([]);
  /** Monotonic id per lookup, so a stale response cannot win. */
  const lookupSeq = useRef(0);
  // The translation-load effect runs once, so it needs the live reference
  // rather than the value captured at mount.
  const refRef = useRef(ref);
  useEffect(() => {
    refRef.current = ref;
  }, [ref]);

  // Book list and translation list, once.
  useEffect(() => {
    fetch("/api/bible/books")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.books)) {
          setBooks(d.books);
          booksRef.current = d.books;
        }
      })
      .catch(() => {});
    fetch("/api/bible/translations")
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.translations) || d.translations.length === 0) return;
        const list = d.translations as MergedTranslation[];
        setTranslations(list);
        // The default id isn't guaranteed to survive de-duplication across
        // providers. If it's missing, a <select> silently displays its first
        // option while state still holds the old id — so the reader shows one
        // Bible and fetches another. Pick a real one and re-read.
        setTranslation((cur) => {
          if (list.some((t) => t.id === cur)) return cur;
          // Prefer by NAME, not id. An id belongs to one provider, and which
          // provider wins de-duplication changes as catalogues move — every id
          // in the old list here had gone stale, so the fallback was dropping
          // through to list[0], by then the 1904 Patriarchal Greek New
          // Testament. A Greek NT cannot serve Genesis, so the reader opened
          // on an error. Names survive that, because they are canonicalised.
          const preferred =
            [/^berean standard bible$/i, /^king james version$/i, /^world english bible$/i, /^new international version 2011$/i, /^new american standard bible/i]
              .map((re) => list.find((t) => re.test(t.name)))
              .find(Boolean) ??
            // Last resort is still an ENGLISH Bible with a whole canon, never
            // simply the first row.
            list.find((t) => /english/i.test(t.language ?? "")) ??
            list[0];
          if (preferred && preferred.id !== cur) {
            void lookup(refRef.current, preferred.id);
            return preferred.id;
          }
          return cur;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookup = useCallback(async (r: string, t: string) => {
    const q = r.trim();
    if (!q) return;
    // Two lookups can be in flight at once — the one fired on mount, and the
    // one fired when the default translation turns out not to be in the list.
    // Without this the slower response wins, which showed a "this Bible doesn't
    // include that passage" error sitting above the passage it had just
    // successfully loaded.
    const seq = ++lookupSeq.current;
    setLoading(true);
    setError(null);
    setParaphrase(null);
    setCopied(false);
    try {
      const res = await fetch(
        `/api/bible/passage?ref=${encodeURIComponent(q)}&translation=${encodeURIComponent(t)}`,
      );
      const d = await res.json();
      if (seq !== lookupSeq.current) return; // a newer lookup already ran
      if (!res.ok) throw new Error(d.error || "Couldn't find that passage");
      const p = d as Passage;
      setPassage(p);
      // Reference works for this passage. Fired separately and not awaited: the
      // dictionaries are a footer, and waiting on them would hold up the words
      // people came to read. Same sequence guard, so a stale set never lands.
      setReferences([]);
      fetch(`/api/bible/reference?ref=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((rd) => {
          if (seq !== lookupSeq.current || !rd) return;
          setReferences(rd.entries ?? []);
          setReferenceCredit(rd.attribution ?? null);
        })
        .catch(() => {
          /* the passage is what matters; a missing footer is not an error */
        });
      // Keep the book/chapter pickers in step with whatever was actually found,
      // including free-typed references like "1 Cor 13:4".
      const m = p.reference.match(/^(.*?)\s+(\d+)/);
      if (m) {
        const hit = booksRef.current.find(
          (b) => b.name.toLowerCase() === m[1].trim().toLowerCase(),
        );
        if (hit) {
          setBook(hit.osis);
          setChapter(Number(m[2]));
        }
      }
    } catch (e) {
      if (seq !== lookupSeq.current) return;
      setPassage(null);
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      if (seq === lookupSeq.current) setLoading(false);
    }
  }, []);

  // Show something on first load — or the passage that was linked to.
  // Sermon scripture references point here (/bible?ref=John+3:16), so arriving
  // from the archive lands on the verse rather than the default.
  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get("ref");
    const start = linked?.trim() || "John 3";
    setRef(start);
    refRef.current = start;
    void lookup(start, DEFAULT_TRANSLATION);
  }, [lookup]);

  /** Jump to a whole chapter via the pickers / arrows. */
  function goTo(osis: string, ch: number) {
    const b = books.find((x) => x.osis === osis);
    if (!b) return;
    const safe = Math.min(Math.max(1, ch), b.chapters || ch);
    setBook(osis);
    setChapter(safe);
    const r = `${b.name} ${safe}`;
    setRef(r);
    void lookup(r, translation);
  }

  /** Previous/next chapter, rolling over book boundaries. */
  function step(delta: number) {
    const i = books.findIndex((b) => b.osis === book);
    if (i === -1) return;
    const b = books[i];
    const target = chapter + delta;
    if (target >= 1 && (!b.chapters || target <= b.chapters)) return goTo(book, target);
    const nb = books[i + delta];
    if (!nb) return;
    goTo(nb.osis, delta > 0 ? 1 : nb.chapters || 1);
  }

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

  async function copyWithReference() {
    if (!passage) return;
    const body = passage.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
    try {
      await navigator.clipboard.writeText(
        `${body}\n\n— ${passage.reference} (${passage.translationName})`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  const current = books.find((b) => b.osis === book);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-x-hidden p-4 lg:p-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-ink-900">Bible</h1>
      <p className="mb-4 text-sm text-ink-500">
        Pick a book and chapter, or type a reference. Tap Simplify for a plain-language
        explanation alongside the text.
      </p>

      {/* Book / chapter navigation */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={book}
          onChange={(e) => goTo(e.target.value, 1)}
          aria-label="Book"
          className="min-w-0 max-w-[45%] rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900"
        >
          {books.length === 0 && <option value={DEFAULT_BOOK}>John</option>}
          {books.map((b) => (
            <option key={b.osis} value={b.osis}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={chapter}
          onChange={(e) => goTo(book, Number(e.target.value))}
          aria-label="Chapter"
          className="min-w-0 max-w-[35%] rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900"
        >
          {Array.from({ length: current?.chapters || 1 }, (_, i) => i + 1).map((c) => (
            <option key={c} value={c}>
              Chapter {c}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            aria-label="Previous chapter"
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 transition hover:bg-ink-50"
          >
            ‹
          </button>
          <button
            onClick={() => step(1)}
            aria-label="Next chapter"
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 transition hover:bg-ink-50"
          >
            ›
          </button>
        </div>
        <select
          value={translation}
          onChange={(e) => {
            setTranslation(e.target.value);
            void lookup(ref, e.target.value);
          }}
          aria-label="Translation"
          // Long Bible names are wide. Without min-w-0 / max-w-full the select
          // takes its intrinsic width from the longest option and pushes the
          // page sideways on a phone.
          className="w-full min-w-0 max-w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 sm:ml-auto sm:w-auto sm:max-w-[15rem]"
        >
          {translations.length === 0 && <option value="BSB">Berean Standard Bible</option>}
          {translations.map((t) => (
            <option key={t.id} value={t.id}>
              {/* Very few Bibles have recordings, so mark the ones that do —
                  otherwise a listener has no way to find them. */}
              {t.hasAudio ? `${t.name} 🎧` : t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Free-typed reference, for verse ranges */}
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
          placeholder="e.g. John 3:16-17, Psalm 23, 1 Cor 13:4"
          aria-label="Passage reference"
          className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
        />
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

          {/* The source texts number their verses differently from the
              English. Say which verse is actually on screen BEFORE it is read,
              not in a footnote underneath — the whole risk is quoting the
              wrong one onto a slide. */}
          {passage.versificationNote && (
            <p className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs leading-relaxed text-ink-700">
              {passage.versificationNote}
            </p>
          )}

          <div className="space-y-1.5 leading-relaxed text-ink-800">
            {passage.verses.map((v) => (
              <p key={`${v.chapter}:${v.verse}`}>
                <sup className="mr-1 align-super text-xs font-semibold text-brand-500">{v.verse}</sup>
                {v.text}
              </p>
            ))}
          </div>

          {passage.audio && passage.audio.length > 0 && (
            <section className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">Listen</h3>
                {/* Recordings are per chapter, so say so when only a verse
                    range is on screen. It is always this translation's own
                    recording — audio is never borrowed from another Bible. */}
                <span className="text-xs text-ink-400">
                  {passage.translationName} · whole chapter
                </span>
              </div>
              {passage.audio.length > 1 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {passage.audio.map((a, i) => (
                    <button
                      key={a.narrator}
                      onClick={() => setNarrator(i)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        i === narrator
                          ? "border-accent bg-accent text-onaccent"
                          : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
                      }`}
                    >
                      {a.narrator}
                    </button>
                  ))}
                </div>
              )}
              <audio
                key={passage.audio[Math.min(narrator, passage.audio.length - 1)].url}
                controls
                preload="none"
                className="w-full"
                src={passage.audio[Math.min(narrator, passage.audio.length - 1)].url}
              >
                Your browser doesn&apos;t support audio playback.
              </audio>
            </section>
          )}

          {passage.footnotes && passage.footnotes.length > 0 && (
            <section className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                Study notes
                {passage.footnotesFrom && (
                  <span className="ml-1 font-normal normal-case tracking-normal text-ink-400">
                    — from the {passage.footnotesFrom}
                  </span>
                )}
              </h3>
              <ul className="space-y-1.5">
                {passage.footnotes.map((f, i) => (
                  <li key={`${f.verse}-${i}`} className="text-sm leading-relaxed text-ink-700">
                    <span className="mr-1.5 font-semibold text-brand-500">v{f.verse}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Reference works that discuss these verses, sitting with the study
              notes rather than on a page of their own — the point is to have
              them to hand while reading. Each is an excerpt; the full article
              opens in place, and the dictionary view holds the rest. */}
          {references.length > 0 && (
            <section className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-4">
              <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                Reference
                <span className="font-normal normal-case tracking-normal text-ink-400">
                  — {references.length} {references.length === 1 ? "entry" : "entries"} on this
                  passage
                </span>
                <a
                  href="/bible/dictionary"
                  className="ml-auto font-normal normal-case tracking-normal text-brand-600 underline"
                >
                  Browse the dictionary
                </a>
              </h3>
              <ul className="space-y-2">
                {references.map((e) => (
                  <li key={e.slug} className="text-sm leading-relaxed text-ink-700">
                    <button
                      type="button"
                      onClick={() => setOpenEntry(openEntry === e.slug ? null : e.slug)}
                      className="text-left font-semibold text-brand-600 underline decoration-dotted underline-offset-2"
                    >
                      {e.name}
                    </button>
                    {e.verses.length > 0 && (
                      <span className="ml-1.5 text-xs text-ink-400">
                        v{e.verses.join(", ")}
                      </span>
                    )}
                    <span className="ml-1.5 text-xs text-ink-400">
                      {e.sources.map((s) => DICTIONARY_NAMES[s] ?? s).join(" · ")}
                    </span>
                    {openEntry === e.slug && <span className="block mt-0.5">{e.excerpt}…</span>}
                  </li>
                ))}
              </ul>
              {referenceCredit && (
                <p className="mt-3 text-xs text-ink-400">{referenceCredit}</p>
              )}
            </section>
          )}

          {passage.copyright && <p className="mt-3 text-xs text-ink-400">{passage.copyright}</p>}

          {/* Biblia's Terms of Use require a visible acknowledgement and links
              whenever their service supplies the text. */}
          {passage.providerId === "biblia" && (
            <p className="mt-2 text-xs text-ink-400">
              This site uses the{" "}
              <a href="https://biblia.com/" className="underline" target="_blank" rel="noreferrer">
                Biblia
              </a>{" "}
              web services from{" "}
              <a href="https://www.logos.com/" className="underline" target="_blank" rel="noreferrer">
                Logos Bible Software
              </a>
              .
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
            <button
              onClick={simplify}
              disabled={simplifying}
              className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 disabled:opacity-50"
            >
              <Icon name="help" size={16} />
              {simplifying ? "Simplifying…" : "Simplify"}
            </button>
            <button
              onClick={copyWithReference}
              className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
            >
              <Icon name={copied ? "check" : "link"} size={16} />
              {copied ? "Copied" : "Copy with reference"}
            </button>
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
