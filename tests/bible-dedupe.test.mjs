// Collapsing the same Bible offered by several providers.
//
// The failure mode worth guarding is the QUIET one. A wrong merge does not
// throw — the Bible just stops appearing, and nobody notices until a minister
// goes looking for it. So the must-not-merge cases below matter more than the
// merge cases, and every name here is a real one taken from the live catalogue.
//
// A generic normalizer (strip years, strip parentheticals) was tried first and
// folded NASB 1995 into NASB 2020, and NIV into NIV Anglicized. That is why the
// implementation uses an explicit table; these tests are what keep it honest.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { dedupeKey, canonicalWork } = await import("../lib/bible.ts");

const t = (name, language = "English") => ({ id: name, name, language });
const same = (a, b) => dedupeKey(a) === dedupeKey(b);

describe("de-duplication merges one work under several names", () => {
  test("Westminster Leningrad Codex — four listings, including a misspelling", () => {
    const wlc = [
      t("Westminster Leningrad Codex Hebrew OT", "Ancient Hebrew"),
      t("The Hebrew Bible, Westminister Leningrad Codex", "Hebrew, Ancient"),
      t("Westminister Leningrad Codex", "Hebrew, Ancient"),
      t("Westminster Leningrad Codex", "Hebrew"),
    ];
    const keys = new Set(wlc.map(dedupeKey));
    assert.equal(keys.size, 1, "all four should collapse to one");
    assert.equal(canonicalWork(wlc[1]).canon, "Westminster Leningrad Codex");
  });

  test("Textus Receptus — three listings", () => {
    const keys = new Set(
      [
        t("Textus Receptus", "Ancient Greek"),
        t("Greek Textus Receptus", "Greek, Ancient"),
        t("Greek Textus Receptus, including the variants of Beza, Elzevir, Erasmus, Scrivener, and Stephanus", "Greek, Ancient"),
      ].map(dedupeKey),
    );
    assert.equal(keys.size, 1);
  });

  test("the language tag differs per provider but must not split a work", () => {
    // AO Lab says "Ancient Greek"; WLDEH and API.Bible say "Greek, Ancient".
    assert.ok(same(t("Text-Critical Greek NT", "Ancient Greek"), t("The Text-Critical Greek New Testament", "Greek, Ancient")));
  });

  test("the canonical spelling is what the reader shows", () => {
    assert.equal(canonicalWork(t("American Standard Version (1901)")).canon, "American Standard Version");
    assert.equal(canonicalWork(t("King James (Authorised) Version")).canon, "King James Version");
  });
});

describe("de-duplication must NOT merge distinct works", () => {
  test("different editions of the same translation stay apart", () => {
    assert.ok(!same(t("New American Standard Bible 1995"), t("New American Standard Bible 2020")));
    assert.ok(!same(t("New International Version 2011"), t("New International Version (Anglicized) 2011")));
    assert.ok(!same(t("World English Bible"), t("World English Bible British Edition")));
    assert.ok(!same(t("World English Bible"), t("World English Bible Updated")));
    assert.ok(!same(t("World Messianic Bible"), t("World Messianic Bible British Edition")));
  });

  test("a Bible with the Apocrypha is not the same Bible without it", () => {
    assert.ok(!same(t("King James Version"), t("King James Version + Apocrypha")));
    assert.ok(!same(t("King James Version"), t("Cambridge Paragraph Bible of the KJV")));
  });

  test("a Greek text is never folded into its English translation", () => {
    // The whole point of scoping each rule to a script. Brenton, Family 35 and
    // the Text-Critical NT each ship in both, under near-identical names.
    assert.ok(!same(t("Brenton Greek Septuagint", "Greek, Ancient"), t("Brenton English translation of the Septuagint", "English")));
    assert.ok(
      !same(
        t("The Greek New Testament According to Family 35, Third Edition", "Greek, Ancient"),
        t("The English New Testament According to Family 35", "English"),
      ),
    );
    assert.ok(!same(t("Text-Critical Greek NT", "Ancient Greek"), t("The Text-Critical English New Testament", "English")));
  });

  test("two different Hebrew source texts stay apart", () => {
    assert.ok(!same(t("Hebrew Masoretic OT", "Ancient Hebrew"), t("Westminster Leningrad Codex", "Hebrew")));
  });

  test("an unmatched Bible still keys on its own name", () => {
    assert.equal(dedupeKey(t("Young's Literal Translation")), "youngsliteraltranslation");
    assert.ok(!same(t("NET Bible"), t("Amplified Bible")));
  });
});
