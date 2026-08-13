// Parsing a free-typed Scripture reference.
//
// The forms below are how people actually write references, not how a parser
// wishes they would. Before the usfm-references tables were ported, "Jn 1:1"
// parsed while "Mt 5:9" did not, none of "I Corinthians", "First John" or
// "III John" worked, and neither did the Apocrypha — which the reader serves
// through the KJV with Apocrypha and the Catholic Public Domain Version.
//
// Pure string work — no network, so these always run.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { parseReference, refLabel } = await import("../lib/bible.ts");

const osisOf = (s) => parseReference(s)?.osis ?? null;

describe("book names", () => {
  test("full names, abbreviations and short forms", () => {
    assert.equal(osisOf("Genesis 1:1"), "GEN");
    assert.equal(osisOf("Mt 5:9"), "MAT");
    assert.equal(osisOf("Jn 1:1"), "JHN");
    assert.equal(osisOf("Phlm 6"), "PHM");
    assert.equal(osisOf("Rev 22:21"), "REV");
  });

  test("multi-word books, which the ported table keys without spaces", () => {
    assert.equal(osisOf("Song of Songs 2:1"), "SNG");
    assert.equal(osisOf("Song of Solomon 2:1"), "SNG");
    assert.equal(osisOf("Canticles 2:1"), "SNG");
  });

  test("alternative names", () => {
    assert.equal(osisOf("Apocalypse 1:1"), "REV");
  });

  test("case and stray full stops do not matter", () => {
    assert.equal(osisOf("MATT. 5:9"), "MAT");
    assert.equal(osisOf("st. john 3:16"), "JHN");
  });
});

describe("numbered books, written three different ways", () => {
  test("arabic", () => {
    assert.equal(osisOf("1 Corinthians 13:4"), "1CO");
    assert.equal(osisOf("2 Timothy 2:15"), "2TI");
    assert.equal(osisOf("3 John 4"), "3JN");
  });

  test("roman — how a good share of ministers write it", () => {
    assert.equal(osisOf("I Corinthians 13:4"), "1CO");
    assert.equal(osisOf("II Timothy 2:15"), "2TI");
    assert.equal(osisOf("III John 4"), "3JN");
  });

  test("spelled out", () => {
    assert.equal(osisOf("First John 1:9"), "1JN");
    assert.equal(osisOf("Second Peter 3:9"), "2PE");
    assert.equal(osisOf("Third John 4"), "3JN");
  });

  test("an ordinal that cannot exist is rejected, not guessed", () => {
    assert.equal(parseReference("4 John 1:1"), null);
    assert.equal(parseReference("IIV John 1:1"), null);
    assert.equal(parseReference("2 Genesis 1:1"), null);
  });
});

describe("the Apocrypha, which two of our Bibles carry", () => {
  test("deuterocanonical books parse", () => {
    assert.equal(osisOf("Sirach 3:1"), "SIR");
    assert.equal(osisOf("Tobit 4:15"), "TOB");
    assert.equal(osisOf("Judith 8:1"), "JDT");
    assert.equal(osisOf("Wisdom 3:1"), "WIS");
    assert.equal(osisOf("1 Maccabees 2:1"), "1MA");
    assert.equal(osisOf("2 Maccabees 7:1"), "2MA");
  });
});

describe("ranges", () => {
  test("a plain verse range stays within its chapter", () => {
    const p = parseReference("John 3:16-17");
    assert.equal(p.chapter, 3);
    assert.equal(p.verseFrom, 16);
    assert.equal(p.verseTo, 17);
    assert.equal(p.chapterTo, undefined, "no chapter span for a same-chapter range");
  });

  test("a range may cross a chapter break", () => {
    const p = parseReference("Matthew 5:1-7:29");
    assert.equal(p.chapter, 5);
    assert.equal(p.verseFrom, 1);
    assert.equal(p.chapterTo, 7);
    assert.equal(p.verseTo, 29);
    assert.equal(refLabel(p), "Matthew 5:1-7:29");
  });

  test("a backwards range is a typo, and is refused rather than swapped", () => {
    assert.equal(parseReference("John 4:2-3:1"), null);
  });

  test("a whole chapter has no verses", () => {
    const p = parseReference("Psalm 23");
    assert.equal(p.chapter, 23);
    assert.equal(p.verseFrom, undefined);
    assert.equal(refLabel(p), "Psalms 23");
  });
});

describe("nonsense is rejected", () => {
  test("unknown books and empty input", () => {
    for (const bad of ["", "   ", "Hezekiah 1:1", "42", "John", "the book of life 1:1"]) {
      assert.equal(parseReference(bad), null, `"${bad}" should not parse`);
    }
  });
});
