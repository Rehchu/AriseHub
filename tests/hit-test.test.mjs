// Hit testing for the label designer.
//
// The bug this exists for: a clip-art sparkle's BOX is fully clickable even
// where the art is transparent, so a sparkle laid over {name} swallowed every
// click meant for the text. Three of eight elements on a real board could not
// be selected at all.
//
// The geometry — undoing rotation, then mapping through object-fit — is the
// part that would be silently wrong, so it is what these check. No DOM: the
// element lookup is passed a null stage, which exercises the box/rotation maths
// and the documented "treat it as solid" fallback.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hitsElement } from "../lib/hit-test.ts";

const box = (over = {}) => ({ id: "e", kind: "rect", x: 0.2, y: 0.2, w: 0.4, h: 0.4, ...over });

describe("box hit testing", () => {
  test("a point inside the box hits", () => {
    assert.equal(hitsElement(box(), 0.4, 0.4, null), true);
  });

  test("a point outside the box misses", () => {
    assert.equal(hitsElement(box(), 0.05, 0.4, null), false);
    assert.equal(hitsElement(box(), 0.4, 0.9, null), false);
  });

  test("the edges are inclusive", () => {
    assert.equal(hitsElement(box(), 0.2, 0.2, null), true);
    assert.equal(hitsElement(box(), 0.6, 0.6, null), true);
  });

  test("a zero-sized element cannot be hit", () => {
    assert.equal(hitsElement(box({ w: 0 }), 0.2, 0.4, null), false);
  });

  test("negative width still describes a real rectangle", () => {
    // Resizing can leave w negative; the box is the same region either way.
    assert.equal(hitsElement(box({ x: 0.6, w: -0.4 }), 0.4, 0.4, null), true);
  });
});

describe("rotation", () => {
  // A wide, short bar rotated 90° becomes tall and narrow. A point above the
  // unrotated bar but inside the rotated one must hit, and vice versa — that is
  // the whole reason the inverse rotation exists.
  const bar = { id: "b", kind: "rect", x: 0.25, y: 0.45, w: 0.5, h: 0.1 };
  // Square stage, so the aspect correction is identity and the maths is exact.
  const squareStage = { clientWidth: 100, clientHeight: 100 };

  test("unrotated, the bar is wide and short", () => {
    assert.equal(hitsElement(bar, 0.7, 0.5, squareStage), true, "right end should hit");
    assert.equal(hitsElement(bar, 0.5, 0.25, squareStage), false, "well above should miss");
  });

  test("rotated 90°, the same bar is tall and narrow", () => {
    const turned = { ...bar, rotation: 90 };
    assert.equal(
      hitsElement(turned, 0.5, 0.25, squareStage),
      true,
      "a point above the centre should now hit the upright bar",
    );
    assert.equal(
      hitsElement(turned, 0.7, 0.5, squareStage),
      false,
      "the old right end is now empty space",
    );
  });

  test("rotating by 360° changes nothing", () => {
    for (const p of [[0.7, 0.5], [0.5, 0.25], [0.3, 0.5]]) {
      assert.equal(
        hitsElement({ ...bar, rotation: 360 }, p[0], p[1], squareStage),
        hitsElement(bar, p[0], p[1], squareStage),
        `point ${p} disagreed after a full turn`,
      );
    }
  });

  test("the centre hits at every angle", () => {
    for (const deg of [0, 30, 45, 90, 137, 180, -90]) {
      assert.equal(
        hitsElement({ ...bar, rotation: deg }, 0.5, 0.5, squareStage),
        true,
        `centre missed at ${deg}°`,
      );
    }
  });
});

describe("non-image kinds are solid", () => {
  for (const kind of ["text", "rect", "line", "qr", "barcode"]) {
    test(`${kind} hits anywhere in its box`, () => {
      assert.equal(hitsElement(box({ kind }), 0.25, 0.55, null), true);
    });
  }

  test("an image with no stage to sample falls back to its box", () => {
    // Failing toward the old behaviour is deliberate: a click that selects the
    // wrong thing is recoverable, one that selects nothing feels broken.
    assert.equal(hitsElement(box({ kind: "image" }), 0.4, 0.4, null), true);
  });
});
