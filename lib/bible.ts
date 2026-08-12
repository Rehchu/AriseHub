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

/** A narrated recording of a chapter. */
export interface AudioTrack {
  /** Reader's name, e.g. "Hays". */
  narrator: string;
  url: string;
}

/** A study note / footnote anchored to a verse. */
export interface Footnote {
  verse: number;
  text: string;
  caller?: string;
}

export interface Passage {
  reference: string;
  translation: string; // provider translation id, e.g. "web"
  translationName: string;
  copyright?: string;
  verses: BibleVerse[];
  text: string; // plain joined text
  providerId: string;
  /** Study notes for the verses shown, when the source carries them. */
  footnotes?: Footnote[];
  /**
   * Set when the notes were borrowed from another translation because the
   * selected one has none — the UI says so rather than implying they ship with
   * the chosen Bible.
   */
  footnotesFrom?: string;
  /**
   * Narrated recordings for this CHAPTER (audio is never per-verse), when the
   * source publishes them.
   */
  audio?: AudioTrack[];
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
        footnotes?: {
          caller?: string;
          text?: string;
          reference?: { chapter?: number; verse?: number };
        }[];
      };
      /** narrator -> mp3 url, e.g. { hays: "https://…/hays.mp3" }. */
      thisChapterAudioLinks?: Record<string, string>;
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

    const shown = new Set(verses.map((v) => v.verse));
    const footnotes: Footnote[] = (d.chapter?.footnotes ?? [])
      .filter((f) => f.text && f.reference?.verse && shown.has(f.reference.verse))
      .map((f) => ({
        verse: f.reference!.verse!,
        text: tidy(f.text!),
        caller: f.caller,
      }))
      .sort((a, b) => a.verse - b.verse);

    // Recordings are per chapter, so they come back whatever verse range was
    // asked for — the reader is responsible for saying so.
    const audio: AudioTrack[] = Object.entries(d.thisChapterAudioLinks ?? {})
      .filter(([, url]) => typeof url === "string" && url)
      .map(([narrator, url]) => ({
        narrator: narrator.charAt(0).toUpperCase() + narrator.slice(1),
        url,
      }));

    return {
      reference: refLabel(p),
      translation: d.translation?.id ?? translation,
      translationName: d.translation?.englishName || d.translation?.name || translation,
      copyright: d.translation?.licenseUrl,
      providerId: "helloao",
      verses,
      text: verses.map((v) => v.text).join(" "),
      ...(footnotes.length ? { footnotes } : {}),
      ...(audio.length ? { audio } : {}),
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

// ── YouVersion Platform (key: YOUVERSION_APP_KEY) ───────────────────────────
// The licensed route to modern translations (NIV, ESV, AMP, TPT…): what the
// catalogue returns is exactly what this app key is approved for.
//
// Three documented traps, all handled below:
//  1. /bibles without language_ranges[] is a 422 — it is mandatory.
//  2. Passage content is HTML unless format=text is asked for.
//  3. The default catalogue is key-restricted (which is what we want — listing
//     all_available would advertise Bibles the church cannot actually read).
const YV_BASE = "https://api.youversion.com/v1";
const yvKey = () =>
  process.env.YOUVERSION_APP_KEY?.trim() || process.env.YV_APP_KEY?.trim() || "";

/** Strip any residual markup, in case a response comes back HTML anyway. */
const stripHtml = (s: string) => tidy(s.replace(/<[^>]*>/g, " "));

/**
 * Per-version copyright text, remembered from the catalogue.
 *
 * The passages endpoint does NOT return copyright, but YouVersion's licence
 * requires the version's attribution to be shown wherever its text appears — so
 * it is captured from /bibles and attached to every passage.
 */
const yvCopyright = new Map<string, string>();

/** Version id -> human title, so a passage shows "New International Version". */
const yvTitles = new Map<string, string>();

const youversion: BibleProvider = {
  id: "youversion",
  label: "YouVersion",
  keyless: false,
  configured: () => !!yvKey(),
  async getPassage(ref, translation) {
    const key = yvKey();
    if (!key) throw new Error("YouVersion key not set");
    if (!translation) throw new Error("YouVersion needs a Bible id");
    const p = parseReference(ref);
    if (!p) throw new Error(`Couldn't understand "${ref}" — try e.g. John 3:16`);
    // USFM reference: JHN.3 for a chapter, JHN.3.16 / JHN.3.16-JHN.3.17 for verses.
    const usfm =
      p.verseFrom === undefined
        ? `${p.osis}.${p.chapter}`
        : p.verseTo && p.verseTo !== p.verseFrom
          ? `${p.osis}.${p.chapter}.${p.verseFrom}-${p.osis}.${p.chapter}.${p.verseTo}`
          : `${p.osis}.${p.chapter}.${p.verseFrom}`;
    // HTML, not text: the plain-text form has no verse boundaries at all, so a
    // whole chapter arrives as one block. The HTML marks each verse with
    // class="yv-v" v="N", which is what makes numbered verses possible.
    const res = await fetch(
      `${YV_BASE}/bibles/${encodeURIComponent(translation)}/passages/${usfm}?format=html`,
      { headers: { "X-YVP-App-Key": key } },
    );
    if (!res.ok) throw new Error(`YouVersion ${res.status}`);
    const d = (await res.json()) as {
      id?: string;
      content?: string;
      reference?: string;
    };
    const content = stripHtml(d.content ?? "");
    if (!content) throw new Error("No text found for that reference");

    // Licence requirement: show the version's attribution wherever its text is
    // shown. The passages endpoint omits it, so it comes from the catalogue —
    // fetched once per version if this instance hasn't seen it yet.
    let copyright = yvCopyright.get(translation);
    if (copyright === undefined) {
      try {
        const vRes = await fetch(`${YV_BASE}/bibles/${encodeURIComponent(translation)}`, {
          headers: { "X-YVP-App-Key": key },
        });
        if (vRes.ok) {
          const v = (await vRes.json()) as { copyright?: string; title?: string };
          copyright = v.copyright || "";
          yvCopyright.set(translation, copyright);
        }
      } catch {
        // Attribution lookup must not break the reading itself.
      }
    }

    // Split on the verse markers in the HTML: elements carrying class "yv-v"
    // and a v="N" attribute. Everything between one marker and the next is that
    // verse's text. Falls back to [n] markers, then to a single block, so a
    // format change degrades to readable rather than empty.
    const verses: BibleVerse[] = [];
    const html = d.content ?? "";
    const marker = /<[^>]*\bclass="[^"]*\byv-v\b[^"]*"[^>]*\bv="(\d+)"[^>]*>|<[^>]*\bv="(\d+)"[^>]*\bclass="[^"]*\byv-v\b[^"]*"[^>]*>/g;
    const hits: { verse: number; start: number }[] = [];
    let mm: RegExpExecArray | null;
    while ((mm = marker.exec(html))) {
      hits.push({ verse: Number(mm[1] ?? mm[2]), start: mm.index + mm[0].length });
    }
    for (let i = 0; i < hits.length; i++) {
      const slice = html.slice(hits[i].start, hits[i + 1]?.start ?? html.length);
      const text = stripHtml(slice);
      if (text) {
        verses.push({ book: p.bookName, chapter: p.chapter, verse: hits[i].verse, text });
      }
    }
    if (verses.length === 0) {
      const re = /\[(\d+)\]\s*([^[]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const text = tidy(m[2]);
        if (text) verses.push({ book: p.bookName, chapter: p.chapter, verse: Number(m[1]), text });
      }
    }
    if (verses.length === 0) {
      verses.push({ book: p.bookName, chapter: p.chapter, verse: p.verseFrom ?? 1, text: content });
    }

    return {
      reference: d.reference || refLabel(p),
      translation,
      translationName: yvTitles.get(translation) || translation,
      copyright: copyright || undefined,
      providerId: "youversion",
      verses,
      text: content,
    };
  },
  async translations() {
    const key = yvKey();
    if (!key) return [];
    // language_ranges[] is mandatory (a 422 without it). Both the ISO 639-3 and
    // 2-letter codes are sent because the catalogue tags versions "en" while the
    // parameter is documented as "eng" — asking for both avoids an empty list.
    //
    // page_size caps at 99, NOT the 100 the docs imply: 100 is a hard 400.
    const out: Translation[] = [];
    let pageToken: string | null = null;
    for (let page = 0; page < 6; page++) {
      const url =
        `${YV_BASE}/bibles?language_ranges[]=eng&language_ranges[]=en&page_size=99` +
        (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "");
      const res: Response = await fetch(url, { headers: { "X-YVP-App-Key": key } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`YouVersion ${res.status}: ${body.slice(0, 200)}`);
      }
      const d = (await res.json()) as {
        data?: unknown[];
        next_page_token?: string | null;
      };
      const rows = (d.data ?? []) as {
        id?: string | number;
        abbreviation?: string;
        localized_abbreviation?: string;
        title?: string;
        localized_title?: string;
        copyright?: string | null;
        language_tag?: string;
      }[];
      for (const b of rows) {
        if (b.id === undefined) continue;
        const id = String(b.id);
        const name =
          b.title || b.localized_title || b.abbreviation || b.localized_abbreviation || id;
        // Remember attribution + title so passages can carry them.
        if (b.copyright) yvCopyright.set(id, b.copyright);
        yvTitles.set(id, name);
        out.push({ id, name, language: "English" });
      }
      pageToken = d.next_page_token ?? null;
      if (!pageToken || rows.length === 0) break;
    }
    return out;
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
      `?content-type=text&include-verse-numbers=true&include-notes=true&include-titles=false&include-chapter-numbers=false`;
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
// YouVersion first: when its key is set it is the licensed source for the
// modern translations, and its catalogue is already scoped to what the church
// is actually approved to read.
const PROVIDERS: BibleProvider[] = [youversion, helloao, apiBible, biblia, bibleApiCom, wldeh];

/** A translation in the merged list, remembering which provider serves it. */
export interface MergedTranslation extends Translation {
  providerId: string;
  /** Has narrated chapter recordings — surfaced so listeners can find them. */
  hasAudio?: boolean;
}

/**
 * Translations known to publish narrated audio.
 *
 * A snapshot, not a live check: the catalogue endpoints don't report audio, so
 * knowing would otherwise mean probing a chapter of all 50+ English Bibles on
 * every page load. Only two of 53 carry recordings today, which is exactly why
 * they need flagging — nobody would find them by scrolling.
 *
 * To refresh: fetch /api/{id}/JHN/1.json for each translation and keep the ones
 * with a non-empty thisChapterAudioLinks.
 */
const AUDIO_TRANSLATIONS = new Set(["BSB", "AAB"]);

/**
 * The Bibles to actually offer, by translation id (see BIBLE-LIST.md).
 *
 * EMPTY MEANS SHOW EVERYTHING. Fill this in to curate the dropdown down to the
 * handful the church actually reads — a shorter list is faster to load and far
 * easier to pick from than 75 entries. Ids that no configured provider serves
 * are simply ignored, so a stale entry can't break the list.
 */
export const ALLOWED_TRANSLATIONS: string[] = [];

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

  const allow = ALLOWED_TRANSLATIONS.length ? new Set(ALLOWED_TRANSLATIONS) : null;
  const seen = new Set<string>();
  const merged: MergedTranslation[] = [];
  for (const t of lists.flat()) {
    if (allow && !allow.has(t.id)) continue;
    // The allowlist is the deliberate choice, so it overrides the English
    // filter — a curated entry is never dropped for lacking a language tag.
    if (!allow && englishOnly && !/english/i.test(t.language ?? "")) continue;
    const k = dedupeKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(AUDIO_TRANSLATIONS.has(t.id) ? { ...t, hasAudio: true } : t);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

/** A book of the Bible, for the reader's navigation. */
export interface BookInfo {
  osis: string;
  name: string;
  chapters: number;
}

let bookCache: BookInfo[] | null = null;

/**
 * The 66 books with their chapter counts, so the reader can offer real
 * navigation instead of making people type a reference. Cached per instance —
 * the canon does not change. Falls back to the built-in book list (without
 * chapter counts) if the lookup fails, so navigation degrades rather than dies.
 */
export async function bibleBooks(): Promise<BookInfo[]> {
  if (bookCache) return bookCache;
  try {
    const res = await fetch("https://bible.helloao.org/api/BSB/books.json");
    if (!res.ok) throw new Error(`AO Lab ${res.status}`);
    const d = (await res.json()) as {
      books?: { id: string; commonName?: string; name?: string; numberOfChapters?: number }[];
    };
    const books = (d.books ?? [])
      .filter((b) => b.id && b.numberOfChapters)
      .map((b) => ({
        osis: b.id,
        name: b.commonName || b.name || b.id,
        chapters: b.numberOfChapters as number,
      }));
    if (books.length) {
      bookCache = books;
      return books;
    }
  } catch {
    // fall through to the static list
  }
  return BOOKS.map((b) => ({ osis: b.osis, name: DISPLAY[b.osis], chapters: 0 }));
}

/**
 * The Bible whose study notes are borrowed when the selected translation has
 * none. BSB (keyless, modern, well annotated) is a safe default for a reader
 * who just wants the notes to be there.
 */
const NOTES_SOURCE = { translation: "BSB", name: "Berean Standard Bible" };

/**
 * Study notes for a reference, so annotations can appear whatever Bible is
 * selected. Returns [] rather than throwing — missing notes must never break a
 * passage lookup.
 */
export async function annotationsFor(ref: string): Promise<{ footnotes: Footnote[]; from: string }> {
  try {
    const p = await helloao.getPassage(ref, NOTES_SOURCE.translation);
    return { footnotes: p.footnotes ?? [], from: NOTES_SOURCE.name };
  } catch {
    return { footnotes: [], from: NOTES_SOURCE.name };
  }
}

/**
 * Per-provider health, for when a Bible source silently fails to appear.
 *
 * allTranslations() deliberately swallows a provider's error so one bad source
 * cannot empty the whole list — which is right for readers, but leaves nothing
 * to debug with. This reports what each provider actually did.
 */
export async function providerDiagnostics(): Promise<
  { id: string; label: string; keyless: boolean; configured: boolean; count: number; error?: string; sample?: string[] }[]
> {
  return Promise.all(
    PROVIDERS.map(async (p) => {
      const base = { id: p.id, label: p.label, keyless: p.keyless, configured: p.configured() };
      if (!base.configured) {
        return { ...base, count: 0, error: "no key set — provider skipped" };
      }
      try {
        const list = await p.translations();
        return { ...base, count: list.length, sample: list.slice(0, 5).map((t) => `${t.name} [${t.id}]`) };
      } catch (e) {
        return { ...base, count: 0, error: e instanceof Error ? e.message : "failed" };
      }
    }),
  );
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
