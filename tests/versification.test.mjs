// Verse numbering across the Hebrew, Greek and English.
//
// The numbers here were measured from the editions the app serves (heb_wlc vs
// eng_kjv, all 150 psalms). Psalm 3 is the worked example throughout: the
// Hebrew counts "A Psalm of David, when he fled from Absalom" as verse 1, so
// Hebrew 3:2 carries the words an English reader knows as 3:1.
//
// Pure arithmetic over strings — no network, so these always run.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { versificationOf, mapReference } = await import("../lib/versification.ts");

describe("versificationOf", () => {
  test("Hebrew editions, however their language is spelled", () => {
    for (const lang of ["Hebrew", "Ancient Hebrew", "Hebrew, Ancient", "Hebrew, Modern"]) {
      assert.equal(versificationOf({ name: "Westminster Leningrad Codex", language: lang }), "hebrew");
    }
  });

  test("the Greek OLD Testament renumbers; the Greek New Testament does not", () => {
    assert.equal(versificationOf({ name: "Brenton Greek Septuagint", language: "Greek, Ancient" }), "septuagint");
    // These follow English numbering — treating them as English is correct.
    for (const name of ["SBL Greek NT", "Textus Receptus", "Byzantine Greek NT", "Tischendorf Greek NT"]) {
      assert.equal(versificationOf({ name, language: "Ancient Greek" }), "english");
    }
  });

  test("English is the default", () => {
    assert.equal(versificationOf({ name: "King James Version", language: "English" }), "english");
    assert.equal(versificationOf({ name: "Whatever" }), "english");
  });
});

describe("mapReference — Hebrew psalms", () => {
  test("shifts by one where the Hebrew counts a one-line heading", () => {
    const m = mapReference("PSA", 3, "hebrew", 1);
    assert.equal(m.verseFrom, 2, "English 3:1 is Hebrew 3:2");
    assert.match(m.note, /Hebrew 3:2/);
    assert.match(m.note, /English 3:1/);
  });

  test("shifts by two for the four psalms with a two-line heading", () => {
    for (const psalm of [51, 52, 54, 60]) {
      assert.equal(mapReference("PSA", psalm, "hebrew", 1).verseFrom, 3);
    }
  });

  test("carries a verse RANGE across intact", () => {
    const m = mapReference("PSA", 51, "hebrew", 10, 12);
    assert.equal(m.verseFrom, 12);
    assert.equal(m.verseTo, 14);
    assert.match(m.note, /12-14/);
  });

  test("leaves aligned psalms alone and says nothing", () => {
    // Psalm 23 has no superscription verse — both count 6.
    const m = mapReference("PSA", 23, "hebrew", 1);
    assert.equal(m.verseFrom, undefined);
    assert.equal(m.note, undefined);
  });

  test("a whole-chapter request still warns, without inventing a verse", () => {
    const m = mapReference("PSA", 3, "hebrew");
    assert.equal(m.verseFrom, undefined, "no verse was asked for, so none is returned");
    assert.match(m.note, /heading/);
  });
});

describe("mapReference — where we refuse to guess", () => {
  test("books whose chapters divide differently warn instead of remapping", () => {
    // Hebrew Joel has four chapters to English's three. A verse offset cannot
    // express that, so no shift is applied.
    const m = mapReference("JOL", 2, "hebrew", 28);
    assert.equal(m.verseFrom, 28, "left untouched");
    assert.match(m.note, /divides this book's chapters differently/);
  });

  test("Septuagint psalms warn about the chapter shift", () => {
    const m = mapReference("PSA", 23, "septuagint", 1);
    assert.match(m.note, /one behind/);
    assert.equal(m.verseFrom, 1, "not shifted — the mapping is not derived");
  });

  test("Septuagint books other than Psalms pass through", () => {
    assert.deepEqual(mapReference("ISA", 53, "septuagint", 5), {});
  });

  test("English targets are always a no-op", () => {
    assert.deepEqual(mapReference("PSA", 3, "english", 1), {});
  });
});
