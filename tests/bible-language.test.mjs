// Which Bibles survive into the reader's list.
//
// This filter decides what the church can see. Getting it wrong is quiet in the
// worst way: a bad pattern does not throw, it just removes Bibles, and nobody
// notices until a minister goes looking for a translation that used to be
// there. So the real language tags each provider actually emits are pinned here
// rather than paraphrased — they differ per source ("Ancient Greek" from AO Lab,
// "Greek, Ancient" from WLDEH) and a regex that only matched one would silently
// drop the other's texts.
//
// Pure predicates over strings — no network, so these always run.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { isSourceText, languageKept } = await import("../lib/bible.ts");

const t = (language) => ({ id: "x", name: "X", language });

describe("languageKept", () => {
  test("keeps English", () => {
    assert.equal(languageKept(t("English")), true);
    assert.equal(languageKept(t("english")), true);
  });

  test("keeps the Greek and Hebrew source texts the ministers preach from", () => {
    // Exactly as each provider spells them — see the note above.
    for (const lang of [
      "Ancient Greek", // AO Lab
      "Greek, Ancient", // WLDEH
      "Ancient Hebrew",
      "Hebrew",
      "Hebrew, Ancient",
      "Hebrew, Modern",
    ]) {
      assert.equal(languageKept(t(lang)), true, `${lang} should be kept`);
    }
  });

  test("drops languages this church does not read", () => {
    for (const lang of ["Ahirani", "Arabic", "Spanish", "Bodo Parja", "Arapaho"]) {
      assert.equal(languageKept(t(lang)), false, `${lang} should be dropped`);
    }
  });

  test("KEEPS a Bible with no language tag at all", () => {
    // The important one. A missing tag must never be read as "not English":
    // that is how a licensed Bible disappears from the church's approved list
    // without anyone noticing. Only an explicit foreign tag may filter.
    assert.equal(languageKept(t(undefined)), true);
    assert.equal(languageKept(t("")), true);
    assert.equal(languageKept(t("   ")), true);
    assert.equal(languageKept({ id: "x", name: "X" }), true);
  });
});

describe("isSourceText", () => {
  test("recognises Greek and Hebrew", () => {
    assert.equal(isSourceText(t("Ancient Greek")), true);
    assert.equal(isSourceText(t("Greek, Ancient")), true);
    assert.equal(isSourceText(t("Hebrew")), true);
  });

  test("English is not a source text", () => {
    // Source texts bypass the keyless allowlist; English must not, or all 1,200
    // free English editions would pour back into the list.
    assert.equal(isSourceText(t("English")), false);
  });

  test("an untagged Bible is not a source text", () => {
    // languageKept() keeps these, but they must not skip curation on top of it.
    assert.equal(isSourceText(t(undefined)), false);
  });
});
