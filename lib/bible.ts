// Bible provider abstraction.
//
// Several sources sit behind one interface so the reader/search UI never has to
// care which one is serving a passage. Keyless providers (bible-api.com, and the
// others to come — WLDEH, AO Lab's helloao) work out of the box; keyed providers
// (API.Bible, Biblia) read their key from the environment and quietly sit out
// when it is absent, so nothing breaks before the secret is set.

export interface BibleVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Passage {
  reference: string;
  translation: string; // provider translation id, e.g. "web"
  translationName: string;
  copyright?: string;
  verses: BibleVerse[];
  text: string; // plain joined text
  providerId: string;
}

export interface Translation {
  id: string;
  name: string;
  language?: string;
}

export interface BibleProvider {
  id: string;
  label: string;
  keyless: boolean;
  /** Usable right now? (keyless, or its key is present). */
  configured(): boolean;
  getPassage(ref: string, translation?: string): Promise<Passage>;
  translations(): Promise<Translation[]>;
}

/** Collapse the ragged whitespace these APIs pad verses with. */
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

// ── bible-api.com (keyless; public-domain translations) ─────────────────────
const bibleApiCom: BibleProvider = {
  id: "bible-api",
  label: "bible-api.com",
  keyless: true,
  configured: () => true,
  async getPassage(ref, translation = "web") {
    const url = `https://bible-api.com/${encodeURIComponent(ref)}?translation=${encodeURIComponent(translation)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`bible-api.com ${res.status}`);
    const d = (await res.json()) as {
      reference: string;
      verses?: { book_name: string; chapter: number; verse: number; text: string }[];
      text: string;
      translation_id: string;
      translation_name: string;
      translation_note?: string;
    };
    return {
      reference: d.reference,
      translation: d.translation_id,
      translationName: d.translation_name,
      copyright: d.translation_note,
      providerId: "bible-api",
      verses: (d.verses ?? []).map((v) => ({
        book: v.book_name,
        chapter: v.chapter,
        verse: v.verse,
        text: tidy(v.text),
      })),
      text: tidy(d.text),
    };
  },
  async translations() {
    const res = await fetch("https://bible-api.com/data");
    if (!res.ok) throw new Error(`bible-api.com ${res.status}`);
    const d = (await res.json()) as {
      translations?: { identifier: string; name: string; language: string }[];
    };
    return (d.translations ?? []).map((t) => ({
      id: t.identifier,
      name: t.name,
      language: t.language,
    }));
  },
};

// Registered providers, most-preferred first. Keyed adapters (API.Bible via
// API_BIBLE_KEY, Biblia via BIBLIA_API_KEY) and the other keyless sources land
// here next, behind this same interface.
const PROVIDERS: BibleProvider[] = [bibleApiCom];

/** Providers usable right now (keyless, or key present). */
export function bibleProviders(): BibleProvider[] {
  return PROVIDERS.filter((p) => p.configured());
}

/** Resolve a provider by id, falling back to the first configured one. */
export function getProvider(id?: string | null): BibleProvider {
  if (id) {
    const p = PROVIDERS.find((x) => x.id === id && x.configured());
    if (p) return p;
  }
  const first = bibleProviders()[0];
  if (!first) throw new Error("no Bible provider configured");
  return first;
}
