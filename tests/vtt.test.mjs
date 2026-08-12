// Transcript parsing for the sermon archive.
//
// The input is whatever the church's captioning tool produced, so this is
// deliberately unglamorous: headers, comments, cue settings, markup, and
// YouTube's rolling auto-captions that repeat the previous line every cue.
// Pure logic over strings — no database, so these always run.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { parseVtt, parseTimestamp, parseTimestampedText, parseTranscript } =
  await import("../lib/vtt.ts");

describe("parseTimestamp", () => {
  test("reads hours, minutes, seconds and milliseconds", () => {
    assert.equal(parseTimestamp("00:00:01.000"), 1);
    assert.equal(parseTimestamp("01:02:03.500"), 3723.5);
  });

  test("accepts the short form without hours", () => {
    assert.equal(parseTimestamp("02:05"), 125);
  });

  test("accepts SRT's comma decimal", () => {
    assert.equal(parseTimestamp("00:00:02,250"), 2.25);
  });

  test("rejects nonsense rather than guessing", () => {
    assert.equal(parseTimestamp("banana"), null);
    assert.equal(parseTimestamp("00:99:00.000"), null);
  });
});

describe("parseVtt", () => {
  test("parses a plain WebVTT file", () => {
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:04.000
For God so loved the world

00:00:04.500 --> 00:00:08.000
that he gave his only Son`,
    );
    assert.equal(cues.length, 2);
    assert.deepEqual(cues[0], {
      idx: 0,
      startSeconds: 1,
      endSeconds: 4,
      text: "For God so loved the world",
    });
    assert.equal(cues[1].startSeconds, 4.5);
  });

  test("ignores cue identifiers, NOTE and STYLE blocks", () => {
    const cues = parseVtt(
      `WEBVTT

NOTE this file was auto-generated

STYLE
::cue { color: white }

intro-1
00:00:02.000 --> 00:00:05.000
Welcome to church`,
    );
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, "Welcome to church");
  });

  test("strips speaker tags and karaoke stamps", () => {
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:03.000
<v Pastor>Turn with me<00:00:02.000><c> to John three</c>`,
    );
    assert.equal(cues[0].text, "Turn with me to John three");
  });

  test("tolerates cue settings after the end time", () => {
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:03.000 align:start position:0%
Grace and peace`,
    );
    assert.equal(cues[0].endSeconds, 3);
    assert.equal(cues[0].text, "Grace and peace");
  });

  test("joins a multi-line cue into one line", () => {
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:05.000
this is the first half
and this is the second`,
    );
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, "this is the first half and this is the second");
  });

  test("collapses YouTube's rolling captions instead of repeating them", () => {
    // Auto-captions scroll: each cue repeats the previous tail.
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:03.000
we are going

00:00:03.000 --> 00:00:05.000
we are going to look

00:00:05.000 --> 00:00:07.000
we are going to look at Romans`,
    );
    assert.equal(cues.length, 1, "the growing line should collapse to one cue");
    assert.equal(cues[0].text, "we are going to look at Romans");
    assert.equal(cues[0].startSeconds, 1, "keeps the moment it actually started");
    assert.equal(cues[0].endSeconds, 7, "extends to the last repeat");
  });

  test("drops an exact duplicate but keeps the longer span", () => {
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:02.000
Amen

00:00:02.000 --> 00:00:04.000
Amen`,
    );
    assert.equal(cues.length, 1);
    assert.equal(cues[0].endSeconds, 4);
  });

  test("keeps distinct lines that merely start alike", () => {
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:02.000
the Lord is my shepherd

00:00:02.000 --> 00:00:04.000
the Lord is my light`,
    );
    assert.equal(cues.length, 2);
  });

  test("returns nothing for rubbish rather than throwing", () => {
    assert.deepEqual(parseVtt(""), []);
    assert.deepEqual(parseVtt("this is not a caption file"), []);
  });

  test("skips cues with a broken timing line", () => {
    const cues = parseVtt(
      `WEBVTT

not-a-time --> also-not
ignored

00:00:09.000 --> 00:00:10.000
kept`,
    );
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, "kept");
  });

  test("renumbers idx contiguously after collapsing", () => {
    const cues = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:02.000
one

00:00:02.000 --> 00:00:03.000
one

00:00:03.000 --> 00:00:04.000
two`,
    );
    assert.deepEqual(
      cues.map((c) => c.idx),
      [0, 1],
    );
  });
});

describe("parseTimestampedText", () => {
  test("reads [hh:mm:ss] stamped prose", () => {
    const cues = parseTimestampedText(
      `[00:00:05] Good morning church
[00:01:00] Let us pray`,
    );
    assert.equal(cues.length, 2);
    assert.equal(cues[0].startSeconds, 5);
    assert.equal(cues[0].text, "Good morning church");
    assert.equal(cues[1].startSeconds, 60);
  });

  test("drops words before the first stamp — they can't be seeked to", () => {
    const cues = parseTimestampedText("preamble with no time\n[00:10] the message");
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, "the message");
  });
});

describe("parseTranscript", () => {
  test("picks the VTT parser for caption files", () => {
    const cues = parseTranscript(
      `WEBVTT

00:00:01.000 --> 00:00:02.000
hello`,
      "service.vtt",
    );
    assert.equal(cues[0].text, "hello");
  });

  test("falls back to stamped text for a .txt export", () => {
    const cues = parseTranscript("[00:00:03] hello there", "service.txt");
    assert.equal(cues.length, 1);
    assert.equal(cues[0].startSeconds, 3);
  });
});
