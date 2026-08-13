import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  annotationsFor,
  audioForTranslationName,
  getProvider,
  parseReference,
  refLabel,
  translationFor,
  type BibleProvider,
  type ParsedRef,
  type Passage,
} from "@/lib/bible";
import { mapReference, versificationOf } from "@/lib/versification";

// GET /api/bible/passage?ref=John+3:16&translation=web&provider=bible-api
//
// Fetches a passage for a signed-in user. Passage caching (Supabase bible_cache)
// and the keyed providers land in the next increment; for now this serves the
// keyless sources directly.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get("ref") || "").trim();
  if (!ref) return NextResponse.json({ error: "missing ref" }, { status: 400 });
  const translation = searchParams.get("translation") || undefined;
  const providerId = searchParams.get("provider");

  try {
    // The reader sends a Bible, not a provider — look up whichever provider
    // serves that translation and use it. The catalogue row comes back too, so
    // its language is available for the verse-numbering step below without a
    // second lookup.
    const record = translation ? await translationFor(translation) : null;
    const provider = record ? getProvider(record.providerId) : getProvider(providerId);

    // The Greek and Hebrew number their verses differently from the English.
    // A reference is typed the way it is preached — English numbering — so it
    // is shifted here to land on the same words in the source text. Psalm 3:1
    // in the Hebrew is the superscription, not "LORD, how are they increased".
    let wanted = ref;
    let versificationNote: string | undefined;
    const parsed = record ? parseReference(ref) : null;
    if (record && parsed) {
      const scheme = versificationOf(record);
      const mapped = mapReference(parsed.osis, parsed.chapter, scheme, parsed.verseFrom, parsed.verseTo);
      versificationNote = mapped.note;
      if (mapped.verseFrom !== undefined && mapped.verseFrom !== parsed.verseFrom) {
        wanted = refLabel({ ...parsed, verseFrom: mapped.verseFrom, verseTo: mapped.verseTo });
      }
    }

    // A range crossing a chapter break — "Matthew 5:1-7:29", the Sermon on the
    // Mount — is asked for as whole chapters and trimmed at both ends. Every
    // provider can serve a plain chapter, so this works for all of them rather
    // than needing a passage-id syntax each one spells differently.
    const passage =
      parsed?.chapterTo && parsed.chapterTo !== parsed.chapter
        ? await spanChapters(provider, parsed, translation)
        : await provider.getPassage(wanted, translation);
    if (versificationNote) passage.versificationNote = versificationNote;

    // Study notes should be there whatever Bible was picked. If the selected
    // one carries none, borrow them and say where they came from.
    if (!passage.footnotes?.length) {
      const { footnotes, from } = await annotationsFor(ref);
      if (footnotes.length) {
        passage.footnotes = footnotes;
        passage.footnotesFrom = from;
      }
    }

    // The recordings live on the free copy of a translation, so a licensed
    // edition of the SAME Bible arrives without them. Attaching them here is
    // not borrowing another translation — it is the same words, read aloud.
    if (!passage.audio?.length) {
      const audio = await audioForTranslationName(ref, passage.translationName);
      if (audio.length) passage.audio = audio;
    }

    // Audio is deliberately NOT borrowed from another translation the way notes
    // are: someone listening wants to hear the version they are reading, not a
    // different wording. A Bible without recordings simply has no player.
    return NextResponse.json(passage);
  } catch (e) {
    // Provider errors are for the logs, not the reader. "WLDEH 404" tells a
    // volunteer nothing; "this Bible doesn't have that passage" tells them what
    // to do next. Not every translation carries every book — plenty are New
    // Testament only — so a 404 here is ordinary, not a fault.
    const raw = e instanceof Error ? e.message : "lookup failed";
    let message = raw;
    if (/\b(404|422)\b/.test(raw)) {
      // 422 is how YouVersion rejects a reference a version cannot serve —
      // usually a New Testament-only Bible being asked for an Old Testament
      // book. Same thing a reader needs to hear as a 404.
      message = "This Bible doesn't include that passage — try another translation.";
    } else if (/\b(5\d\d)\b/.test(raw)) {
      message = "That Bible's source is unavailable right now — try another translation.";
    } else if (/\b(401|403)\b/.test(raw)) {
      message = "That Bible isn't available with the current licence.";
    }
    return NextResponse.json({ error: message, detail: raw }, { status: 502 });
  }
}

/**
 * Fetch a reference that runs across a chapter break.
 *
 * Providers disagree about how to express such a range — API.Bible takes
 * JHN.3.16-JHN.4.2, AO Lab serves whole chapters only, bible-api.com has its
 * own spelling. Rather than teach each one, the chapters are fetched whole (the
 * one thing they all do) and trimmed: the first from the opening verse, the
 * last up to the closing one, the middle entire.
 *
 * Capped at MAX_SPAN chapters. Someone typing "Genesis 1:1-50:26" should get an
 * honest refusal, not fifty round trips.
 */
const MAX_SPAN = 6;

async function spanChapters(
  provider: BibleProvider,
  ref: ParsedRef,
  translation?: string,
): Promise<Passage> {
  const from = ref.chapter;
  const to = ref.chapterTo ?? ref.chapter;
  if (to - from + 1 > MAX_SPAN) {
    throw new Error(
      `That range covers ${to - from + 1} chapters — ask for ${MAX_SPAN} or fewer at a time.`,
    );
  }

  const chapters = await Promise.all(
    Array.from({ length: to - from + 1 }, (_, i) =>
      provider.getPassage(`${ref.bookName} ${from + i}`, translation),
    ),
  );

  const verses = chapters.flatMap((c, i) => {
    const chapter = from + i;
    return c.verses.filter((v) => {
      if (chapter === from && ref.verseFrom !== undefined && v.verse < ref.verseFrom) return false;
      if (chapter === to && ref.verseTo !== undefined && v.verse > ref.verseTo) return false;
      return true;
    });
  });

  if (!verses.length) throw new Error("No verses found for that reference");

  // Everything but the verses comes from the first chapter — same Bible, same
  // provider, same copyright. Audio is dropped on purpose: recordings are per
  // chapter, and a player for one chapter of six would be a lie about scope.
  const head = chapters[0];
  return {
    ...head,
    reference: refLabel(ref),
    verses,
    text: verses.map((v) => v.text).join(" "),
    footnotes: chapters.flatMap((c) => c.footnotes ?? []),
    audio: undefined,
  };
}
