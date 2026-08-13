// Verse numbering differs between the Hebrew, the Greek and the English.
//
// This became reachable the day the Greek and Hebrew source texts were added to
// the reader. Psalm 3 is the clearest case: the Hebrew counts the superscription
// ("A Psalm of David, when he fled from Absalom") as verse 1, so Hebrew 3:2 is
// English 3:1 and everything after it is off by one. A minister checking a word
// would land on the title line and not necessarily realise it.
//
// Every number below was MEASURED from the editions this app actually serves —
// heb_wlc against eng_kjv, chapter by chapter, all 150 psalms — rather than
// taken from a third-party mapping file. Two reasons: it matches our exact
// texts, and it keeps the church's repo free of material we have no licence to.
// The three Hebrew editions we carry (heb_wlc, hbo_wlc, HBOMAS) were checked
// against each other and agree on every psalm, so one table serves all of them.
//
// To re-derive: fetch /api/{translation}/PSA/{n}.json for both editions and
// compare the count of `verse` entries.

/** Which numbering scheme a Bible follows. */
export type Versification = "english" | "hebrew" | "septuagint";

/**
 * Hebrew verse number minus English verse number, per psalm.
 *
 * Non-zero only where the Hebrew counts a superscription. The 4 psalms at +2
 * carry a two-line heading (51, 52, 54, 60 — "when Nathan the prophet came to
 * him, after he had gone in to Bathsheba").
 */
const PSALM_OFFSET = new Map<number, number>([
  ...([3, 4, 5, 6, 7, 8, 9, 12, 18, 19, 20, 21, 22, 30, 31, 34, 36, 38, 39, 40, 41, 42, 44, 45,
    46, 47, 48, 49, 53, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 67, 68, 69, 70, 75, 76, 77, 80,
    81, 83, 84, 85, 88, 89, 92, 102, 108, 140, 142,
  ].map((n) => [n, 1] as [number, number])),
  ...([51, 52, 54, 60].map((n) => [n, 2] as [number, number])),
]);

/**
 * Books where the Hebrew and English divide chapters differently — beyond a
 * psalm superscription, so a single verse offset cannot express it.
 *
 * Hebrew Joel has four chapters to English's three (English 2:28-32 is Hebrew
 * 3:1-5); Hebrew Malachi has three to English's four. Jonah, Hosea and
 * Ecclesiastes move a chapter boundary by a verse or two.
 *
 * This list is EMPIRICAL and therefore incomplete: it holds the divergences
 * that were actually measured, not every one that exists. We warn here instead
 * of remapping, because a wrong verse presented confidently is worse than an
 * honest "check the numbering" — especially when the result goes on a slide.
 */
const HEBREW_DIVERGENT = new Set(["JOL", "MAL", "JON", "HOS", "ECC"]);

/** Which numbering a Bible uses, from its language and name. */
export function versificationOf(t: { name?: string; language?: string }): Versification {
  const lang = t.language ?? "";
  if (/hebrew/i.test(lang)) return "hebrew";
  // Only the GREEK OLD TESTAMENT renumbers. The Greek New Testaments — SBL,
  // Textus Receptus, Byzantine, Tischendorf — follow the same numbering as the
  // English, so treating them as English is correct, not a shortcut.
  if (/greek/i.test(lang) && /septuagint|brenton/i.test(t.name ?? "")) return "septuagint";
  return "english";
}

export interface MappedReference {
  /** Verse numbers to request, already shifted where we can do so safely. */
  verseFrom?: number;
  verseTo?: number;
  /** Shown to the reader whenever numbering was changed or may not line up. */
  note?: string;
}

/**
 * Translate a reference typed in English numbering into the target scheme.
 *
 * The church's case decides the direction: the ministers look up a word in the
 * Greek or Hebrew for the verse they are already preaching from, so an English
 * reference is what they type and the source text is what they want back. The
 * shift is always reported rather than applied silently.
 */
export function mapReference(
  osis: string,
  chapter: number,
  to: Versification,
  verseFrom?: number,
  verseTo?: number,
): MappedReference {
  if (to === "english") return {};

  if (to === "septuagint") {
    // The Septuagint numbers most psalms one behind the Hebrew (LXX 23 is
    // Hebrew 24), realigning near the end. Mapping that needs a chapter table
    // and per-psalm merges and splits, which has not been derived — so say so
    // rather than serve the wrong psalm.
    if (osis === "PSA") {
      return {
        verseFrom,
        verseTo,
        note: "The Septuagint numbers most psalms one behind the Hebrew and English — this may not be the psalm you meant.",
      };
    }
    return {};
  }

  // Hebrew.
  if (osis === "PSA") {
    const offset = PSALM_OFFSET.get(chapter) ?? 0;
    if (!offset || verseFrom === undefined) {
      return offset
        ? { note: `The Hebrew counts this psalm's heading as ${offset === 1 ? "verse 1" : "verses 1-2"}, so its verse numbers run ${offset} ahead of the English.` }
        : {};
    }
    return {
      verseFrom: verseFrom + offset,
      verseTo: verseTo === undefined ? undefined : verseTo + offset,
      note: `Showing Hebrew ${chapter}:${verseFrom + offset}${verseTo && verseTo !== verseFrom ? `-${verseTo + offset}` : ""}, which is English ${chapter}:${verseFrom}${verseTo && verseTo !== verseFrom ? `-${verseTo}` : ""} — the Hebrew counts the heading as ${offset === 1 ? "a verse" : "two verses"}.`,
    };
  }

  if (HEBREW_DIVERGENT.has(osis)) {
    return {
      verseFrom,
      verseTo,
      note: "The Hebrew divides this book's chapters differently from the English — check the numbering before quoting it.",
    };
  }

  return {};
}
