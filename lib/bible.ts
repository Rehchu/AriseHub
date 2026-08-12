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

// ── Reference parsing ───────────────────────────────────────────────────────
// Chapter-based providers (helloao, API.Bible) need a book CODE, not "John", so
// a free-typed reference has to be broken into {book, chapter, verses}.

const BOOKS: { osis: string; names: string[] }[] = [
  { osis: "GEN", names: ["genesis", "gen"] },
  { osis: "EXO", names: ["exodus", "exo", "ex"] },
  { osis: "LEV", names: ["leviticus", "lev"] },
  { osis: "NUM", names: ["numbers", "num"] },
  { osis: "DEU", names: ["deuteronomy", "deut", "deu"] },
  { osis: "JOS", names: ["joshua", "josh", "jos"] },
  { osis: "JDG", names: ["judges", "judg", "jdg"] },
  { osis: "RUT", names: ["ruth", "rut"] },
  { osis: "1SA", names: ["1 samuel", "1samuel", "1 sam", "1sam"] },
  { osis: "2SA", names: ["2 samuel", "2samuel", "2 sam", "2sam"] },
  { osis: "1KI", names: ["1 kings", "1kings", "1 kgs", "1kgs"] },
  { osis: "2KI", names: ["2 kings", "2kings", "2 kgs", "2kgs"] },
  { osis: "1CH", names: ["1 chronicles", "1 chron", "1chr"] },
  { osis: "2CH", names: ["2 chronicles", "2 chron", "2chr"] },
  { osis: "EZR", names: ["ezra", "ezr"] },
  { osis: "NEH", names: ["nehemiah", "neh"] },
  { osis: "EST", names: ["esther", "est"] },
  { osis: "JOB", names: ["job"] },
  { osis: "PSA", names: ["psalms", "psalm", "psa", "ps"] },
  { osis: "PRO", names: ["proverbs", "prov", "pro"] },
  { osis: "ECC", names: ["ecclesiastes", "eccl", "ecc"] },
  { osis: "SNG", names: ["song of solomon", "song of songs", "song", "sng"] },
  { osis: "ISA", names: ["isaiah", "isa"] },
  { osis: "JER", names: ["jeremiah", "jer"] },
  { osis: "LAM", names: ["lamentations", "lam"] },
  { osis: "EZK", names: ["ezekiel", "ezek", "ezk"] },
  { osis: "DAN", names: ["daniel", "dan"] },
  { osis: "HOS", names: ["hosea", "hos"] },
  { osis: "JOL", names: ["joel", "jol"] },
  { osis: "AMO", names: ["amos", "amo"] },
  { osis: "OBA", names: ["obadiah", "obad", "oba"] },
  { osis: "JON", names: ["jonah", "jon"] },
  { osis: "MIC", names: ["micah", "mic"] },
  { osis: "NAM", names: ["nahum", "nam"] },
  { osis: "HAB", names: ["habakkuk", "hab"] },
  { osis: "ZEP", names: ["zephaniah", "zeph", "zep"] },
  { osis: "HAG", names: ["haggai", "hag"] },
  { osis: "ZEC", names: ["zechariah", "zech", "zec"] },
  { osis: "MAL", names: ["malachi", "mal"] },
  { osis: "MAT", names: ["matthew", "matt", "mat"] },
  { osis: "MRK", names: ["mark", "mrk", "mk"] },
  { osis: "LUK", names: ["luke", "luk", "lk"] },
  { osis: "JHN", names: ["john", "jhn", "jn"] },
  { osis: "ACT", names: ["acts", "act"] },
  { osis: "ROM", names: ["romans", "rom"] },
  { osis: "1CO", names: ["1 corinthians", "1 cor", "1cor"] },
  { osis: "2CO", names: ["2 corinthians", "2 cor", "2cor"] },
  { osis: "GAL", names: ["galatians", "gal"] },
  { osis: "EPH", names: ["ephesians", "eph"] },
  { osis: "PHP", names: ["philippians", "phil", "php"] },
  { osis: "COL", names: ["colossians", "col"] },
  { osis: "1TH", names: ["1 thessalonians", "1 thess", "1th"] },
  { osis: "2TH", names: ["2 thessalonians", "2 thess", "2th"] },
  { osis: "1TI", names: ["1 timothy", "1 tim", "1ti"] },
  { osis: "2TI", names: ["2 timothy", "2 tim", "2ti"] },
  { osis: "TIT", names: ["titus", "tit"] },
  { osis: "PHM", names: ["philemon", "phlm", "phm"] },
  { osis: "HEB", names: ["hebrews", "heb"] },
  { osis: "JAS", names: ["james", "jas"] },
  { osis: "1PE", names: ["1 peter", "1 pet", "1pe"] },
  { osis: "2PE", names: ["2 peter", "2 pet", "2pe"] },
  { osis: "1JN", names: ["1 john", "1 jn", "1jn"] },
  { osis: "2JN", names: ["2 john", "2 jn", "2jn"] },
  { osis: "3JN", names: ["3 john", "3 jn", "3jn"] },
  { osis: "JUD", names: ["jude", "jud"] },
  { osis: "REV", names: ["revelation", "rev"] },
];

const DISPLAY: Record<string, string> = Object.fromEntries(
  BOOKS.map((b) => [
    b.osis,
    b.names[0].replace(/\b\w/g, (c) => c.toUpperCase()),
  ]),
);

export interface ParsedRef {
  osis: string;
  bookName: string;
  chapter: number;
  verseFrom?: number;
  verseTo?: number;
}

/** Human label for a parsed reference: "Psalms 23", "John 3:16-17". */
export function refLabel(p: ParsedRef): string {
  if (p.verseFrom === undefined) return `${p.bookName} ${p.chapter}`;
  const end = p.verseTo && p.verseTo !== p.verseFrom ? `-${p.verseTo}` : "";
  return `${p.bookName} ${p.chapter}:${p.verseFrom}${end}`;
}

/** "John 3:16-17" / "Ps 23" / "1 Cor 13:4" -> structured. null if unparseable. */
export function parseReference(input: string): ParsedRef | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  // Leading book name (may start with a number), then chapter[:verses].
  const m = s.match(/^((?:[123]\s*)?[a-z][a-z ]*?)\s*(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!m) return null;
  const rawBook = m[1].replace(/\s+/g, " ").trim();
  const hit = BOOKS.find((b) => b.names.includes(rawBook));
  if (!hit) return null;
  return {
    osis: hit.osis,
    bookName: DISPLAY[hit.osis],
    chapter: Number(m[2]),
    verseFrom: m[3] ? Number(m[3]) : undefined,
    verseTo: m[4] ? Number(m[4]) : m[3] ? Number(m[3]) : undefined,
  };
}

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

// ── helloao / AO Lab (keyless; large English catalogue) ─────────────────────
// Serves whole chapters (/api/{translation}/{BOOK}/{chapter}.json), so a verse
// range is fetched as its chapter and sliced locally.
const helloao: BibleProvider = {
  id: "helloao",
  label: "AO Lab",
  keyless: true,
  configured: () => true,
  async getPassage(ref, translation = "BSB") {
    const p = parseReference(ref);
    if (!p) throw new Error(`Couldn't understand "${ref}" — try e.g. John 3:16`);
    const res = await fetch(
      `https://bible.helloao.org/api/${encodeURIComponent(translation)}/${p.osis}/${p.chapter}.json`,
    );
    if (!res.ok) throw new Error(`AO Lab ${res.status}`);
    const d = (await res.json()) as {
      translation: { id: string; name: string; englishName?: string; licenseUrl?: string };
      chapter: {
        content: { type?: string; number?: number; content?: unknown[] }[];
      };
    };
    const all: BibleVerse[] = (d.chapter?.content ?? [])
      .filter((i) => i.type === "verse" && typeof i.number === "number")
      .map((i) => ({
        book: p.bookName,
        chapter: p.chapter,
        verse: i.number as number,
        // content is an array of strings and formatting objects; keep the text.
        text: tidy(
          (i.content ?? [])
            .map((c) =>
              typeof c === "string" ? c : ((c as { text?: string })?.text ?? ""),
            )
            .join(" "),
        ),
      }))
      .filter((v) => v.text);

    const verses =
      p.verseFrom === undefined
        ? all
        : all.filter((v) => v.verse >= p.verseFrom! && v.verse <= (p.verseTo ?? p.verseFrom!));
    if (verses.length === 0) throw new Error("No verses found for that reference");

    return {
      reference: refLabel(p),
      translation: d.translation?.id ?? translation,
      translationName: d.translation?.englishName || d.translation?.name || translation,
      copyright: d.translation?.licenseUrl,
      providerId: "helloao",
      verses,
      text: verses.map((v) => v.text).join(" "),
    };
  },
  async translations() {
    const res = await fetch("https://bible.helloao.org/api/available_translations.json");
    if (!res.ok) throw new Error(`AO Lab ${res.status}`);
    const d = (await res.json()) as {
      translations?: {
        id: string;
        name: string;
        englishName?: string;
        language?: string;
        languageEnglishName?: string;
      }[];
    };
    return (d.translations ?? []).map((t) => ({
      id: t.id,
      name: t.englishName || t.name,
      language: t.languageEnglishName || t.language,
    }));
  },
};

// ── WLDEH (keyless; CDN-hosted, large multi-language catalogue) ─────────────
// Chapter JSON off jsDelivr; book segment is the lowercased name with spaces
// removed ("1corinthians", "songofsolomon").
const WLDEH_CDN = "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles";
const wldehBook = (osis: string) =>
  (BOOKS.find((b) => b.osis === osis)?.names[0] ?? "").replace(/\s+/g, "");

const wldeh: BibleProvider = {
  id: "wldeh",
  label: "WLDEH",
  keyless: true,
  configured: () => true,
  async getPassage(ref, translation = "en-kjv") {
    const p = parseReference(ref);
    if (!p) throw new Error(`Couldn't understand "${ref}" — try e.g. John 3:16`);
    const res = await fetch(
      `${WLDEH_CDN}/${encodeURIComponent(translation)}/books/${wldehBook(p.osis)}/chapters/${p.chapter}.json`,
    );
    if (!res.ok) throw new Error(`WLDEH ${res.status}`);
    const d = (await res.json()) as {
      data?: { book: string; chapter: string; verse: string; text: string }[];
    };
    // Some chapters in this dataset list a verse more than once; keep the first
    // of each. Paragraph pilcrows are markup, not text.
    const byVerse = new Map<number, BibleVerse>();
    for (const v of d.data ?? []) {
      const n = Number(v.verse);
      if (byVerse.has(n)) continue;
      byVerse.set(n, {
        book: p.bookName,
        chapter: Number(v.chapter),
        verse: n,
        text: tidy(v.text.replace(/¶/g, "")),
      });
    }
    const all: BibleVerse[] = [...byVerse.values()].sort((a, b) => a.verse - b.verse);
    const verses =
      p.verseFrom === undefined
        ? all
        : all.filter((v) => v.verse >= p.verseFrom! && v.verse <= (p.verseTo ?? p.verseFrom!));
    if (verses.length === 0) throw new Error("No verses found for that reference");
    return {
      reference: refLabel(p),
      translation,
      translationName: translation,
      providerId: "wldeh",
      verses,
      text: verses.map((v) => v.text).join(" "),
    };
  },
  async translations() {
    const res = await fetch(`${WLDEH_CDN}/bibles.json`);
    if (!res.ok) throw new Error(`WLDEH ${res.status}`);
    const d = (await res.json()) as {
      id: string;
      version: string;
      language?: { name?: string };
    }[];
    return (d ?? []).map((t) => ({
      id: t.id,
      name: t.version,
      language: t.language?.name,
    }));
  },
};

// ── API.Bible (key: API_BIBLE_KEY) ──────────────────────────────────────────
// Bible ids look like de4e12af7f28f599-01; passages use OSIS ids (JHN.3.16).
// Text comes back with [n] verse markers, which are split back into verses.
const API_BIBLE_BASE = "https://rest.api.bible/v1";
const apiBibleKey = () => process.env.API_BIBLE_KEY?.trim() || "";

const apiBible: BibleProvider = {
  id: "api-bible",
  label: "API.Bible",
  keyless: false,
  configured: () => !!apiBibleKey(),
  async getPassage(ref, translation) {
    const key = apiBibleKey();
    if (!key) throw new Error("API.Bible key not set");
    if (!translation) throw new Error("API.Bible needs a Bible id");
    const p = parseReference(ref);
    if (!p) throw new Error(`Couldn't understand "${ref}" — try e.g. John 3:16`);
    const passageId =
      p.verseFrom === undefined
        ? `${p.osis}.${p.chapter}`
        : `${p.osis}.${p.chapter}.${p.verseFrom}-${p.osis}.${p.chapter}.${p.verseTo ?? p.verseFrom}`;
    const url =
      `${API_BIBLE_BASE}/bibles/${encodeURIComponent(translation)}/passages/${passageId}` +
      `?content-type=text&include-verse-numbers=true&include-notes=false&include-titles=false&include-chapter-numbers=false`;
    const res = await fetch(url, { headers: { "api-key": key } });
    if (!res.ok) throw new Error(`API.Bible ${res.status}`);
    const d = (await res.json()) as {
      data?: { content?: string; reference?: string; copyright?: string; bibleId?: string };
    };
    const content = d.data?.content ?? "";
    // "[16] For God so loved... [17] For God did not..."
    const verses: BibleVerse[] = [];
    const re = /\[(\d+)\]\s*([^[]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const text = tidy(m[2]);
      if (text) {
        verses.push({ book: p.bookName, chapter: p.chapter, verse: Number(m[1]), text });
      }
    }
    if (verses.length === 0 && tidy(content)) {
      verses.push({ book: p.bookName, chapter: p.chapter, verse: p.verseFrom ?? 1, text: tidy(content) });
    }
    if (verses.length === 0) throw new Error("No verses found for that reference");
    return {
      reference: d.data?.reference || refLabel(p),
      translation,
      translationName: translation,
      copyright: d.data?.copyright,
      providerId: "api-bible",
      verses,
      text: verses.map((v) => v.text).join(" "),
    };
  },
  async translations() {
    const key = apiBibleKey();
    if (!key) return [];
    const res = await fetch(`${API_BIBLE_BASE}/bibles`, { headers: { "api-key": key } });
    if (!res.ok) throw new Error(`API.Bible ${res.status}`);
    const d = (await res.json()) as {
      data?: { id: string; name: string; abbreviation?: string; language?: { name?: string } }[];
    };
    return (d.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language?.name,
    }));
  },
};

// ── Biblia / Faithlife (key: BIBLIA_API_KEY) ────────────────────────────────
// Keys are URL-restricted, so calls send a Referer for the church's domain.
// Terms of Use REQUIRE a visible "Powered by Biblia / Logos" acknowledgement —
// the reader renders it whenever a passage comes from this provider.
const BIBLIA_BASE = "https://api.biblia.com/v1/bible";
const bibliaKey = () => process.env.BIBLIA_API_KEY?.trim() || "";
const bibliaReferer = () =>
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://arisehub.myfaithtech.com";

export const BIBLIA_ATTRIBUTION =
  "This site uses the Biblia web services from Logos Bible Software.";

const biblia: BibleProvider = {
  id: "biblia",
  label: "Biblia",
  keyless: false,
  configured: () => !!bibliaKey(),
  async getPassage(ref, translation = "LEB") {
    const key = bibliaKey();
    if (!key) throw new Error("Biblia key not set");
    const p = parseReference(ref);
    if (!p) throw new Error(`Couldn't understand "${ref}" — try e.g. John 3:16`);
    // Biblia wants "John3.16" / "John3.16-17" style passages.
    const passage =
      p.verseFrom === undefined
        ? `${p.bookName.replace(/\s+/g, "")}${p.chapter}`
        : `${p.bookName.replace(/\s+/g, "")}${p.chapter}.${p.verseFrom}` +
          (p.verseTo && p.verseTo !== p.verseFrom ? `-${p.verseTo}` : "");
    const url =
      `${BIBLIA_BASE}/content/${encodeURIComponent(translation)}.txt` +
      `?passage=${encodeURIComponent(passage)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { Referer: bibliaReferer() } });
    if (!res.ok) throw new Error(`Biblia ${res.status}`);
    const body = tidy(await res.text());
    if (!body) throw new Error("No text found for that reference");
    // The .txt service returns a plain block, so it is kept as one passage
    // rather than invented verse splits.
    return {
      reference: refLabel(p),
      translation,
      translationName: translation,
      copyright: BIBLIA_ATTRIBUTION,
      providerId: "biblia",
      verses: [
        { book: p.bookName, chapter: p.chapter, verse: p.verseFrom ?? 1, text: body },
      ],
      text: body,
    };
  },
  async translations() {
    const key = bibliaKey();
    if (!key) return [];
    const res = await fetch(`${BIBLIA_BASE}/find?key=${encodeURIComponent(key)}`, {
      headers: { Referer: bibliaReferer() },
    });
    if (!res.ok) throw new Error(`Biblia ${res.status}`);
    const d = (await res.json()) as {
      bibles?: { bible: string; title?: string; languages?: string[] }[];
    };
    return (d.bibles ?? []).map((b) => ({
      id: b.bible,
      name: b.title || b.bible,
      language: b.languages?.[0] ?? "English",
    }));
  },
};

// Registered providers, most-preferred first. Keyed ones sit out silently until
// their key is set, so the list never breaks before the secrets land.
const PROVIDERS: BibleProvider[] = [helloao, apiBible, biblia, bibleApiCom, wldeh];

/** A translation in the merged list, remembering which provider serves it. */
export interface MergedTranslation extends Translation {
  providerId: string;
}

/** Normalized key for spotting the same Bible offered by several providers. */
const dedupeKey = (t: Translation) =>
  (t.name || t.id).toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Every translation from every configured provider as ONE flat list — sorted
 * by name, with duplicates collapsed (a Bible offered by two providers appears
 * once; the earlier provider in PROVIDERS wins). The reader shows this list
 * directly: users pick a Bible, not a provider.
 */
export async function allTranslations(englishOnly = true): Promise<MergedTranslation[]> {
  const lists = await Promise.all(
    bibleProviders().map(async (p) => {
      try {
        return (await p.translations()).map((t) => ({ ...t, providerId: p.id }));
      } catch {
        return []; // one provider being down must not empty the whole list
      }
    }),
  );

  const seen = new Set<string>();
  const merged: MergedTranslation[] = [];
  for (const t of lists.flat()) {
    if (englishOnly && !/english/i.test(t.language ?? "")) continue;
    const k = dedupeKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(t);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

/** Find the provider that serves a given translation id from the merged list. */
export async function providerForTranslation(id: string): Promise<BibleProvider | null> {
  const all = await allTranslations(false);
  const hit = all.find((t) => t.id === id);
  return hit ? getProvider(hit.providerId) : null;
}

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
