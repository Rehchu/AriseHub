// Colour contrast, measured rather than eyeballed.
//
// AriseHub has no `dark:` classes anywhere — dark mode works by redefining the
// tokens in globals.css, so one token can quietly be doing two contradictory
// jobs. That is exactly what happened: `--color-white` became the dark card
// surface, and because Tailwind v4 compiles `text-white` to that same variable,
// every primary button rendered dark red on near-black at 3.57:1. Nothing in
// the code looked wrong.
//
// So this reads the real tokens out of globals.css and checks every foreground
// on background pair the app actually renders, in both themes.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokensIn(re) {
  const m = css.match(re);
  const out = {};
  if (!m) return out;
  for (const [, k, v] of m[1].matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{3,6})\b/gi)) out[k] = v;
  return out;
}

const base = tokensIn(/@theme\s*\{([\s\S]*?)\n\}/);
const darkOverride = tokensIn(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);

// Stock Tailwind shades used directly in markup. These never invert.
const STOCK = {
  "emerald-700": "#047857",
  "emerald-800": "#065f46",
  "amber-700": "#b45309",
  "amber-800": "#92400e",
  "teal-700": "#0f766e",
  "cyan-700": "#0e7490",
  "green-700": "#15803d",
};

const LIGHT = { white: "#ffffff", ...base, ...STOCK };
const DARK = { ...LIGHT, ...darkOverride };

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [what it is, foreground token, background token, minimum ratio] */
const TEXT_PAIRS = [
  // Filled accent controls. These are why accent/accent-strong/onaccent exist
  // as separate, non-inverting tokens.
  ["primary button", "onaccent", "accent"],
  ["primary button on hover", "onaccent", "accent-strong"],
  ["success button", "onaccent", "emerald-700"],
  ["success button on hover", "onaccent", "emerald-800"],
  ["warning button", "onaccent", "amber-700"],
  ["warning button on hover", "onaccent", "amber-800"],
  ["teal button", "onaccent", "teal-700"],
  ["cyan button", "onaccent", "cyan-700"],
  ["green button", "onaccent", "green-700"],
  // Body copy.
  ["body text on the page", "ink-800", "ink-50"],
  ["body text on a card", "ink-800", "white"],
  ["muted text on a card", "ink-500", "white"],
  ["faint text on a card", "ink-400", "white"],
  ["input placeholder", "ink-400", "white"],
  ["heading on a card", "ink-900", "white"],
  ["brand text on a brand tint", "brand-700", "brand-50"],
  ["brand text on a card", "brand-600", "white"],
  ["secondary button", "ink-700", "ink-100"],
  // Chrome — the sidebar, drawer and kiosk bar stay dark in BOTH themes, so
  // these pairs have to stand on their own rather than inverting into safety.
  ["sidebar nav item", "chrome-200", "chrome-900"],
  ["sidebar nav item on hover", "chrome-50", "chrome-700"],
  ["sidebar person name", "chrome-50", "chrome-900"],
  ["sidebar person role", "chrome-300", "chrome-900"],
  ['sidebar "Soon" chip', "chrome-300", "chrome-700"],
  ["sidebar active item", "chrome-50", "accent"],
];

/** Non-text UI parts only need 3:1 (WCAG 1.4.11). */
const UI_PAIRS = [["focus ring against a card", "accent", "white"]];

for (const [themeName, theme] of [["light", LIGHT], ["dark", DARK]]) {
  describe(`contrast — ${themeName} mode`, () => {
    for (const [what, fg, bg] of TEXT_PAIRS) {
      test(`${what} is legible`, () => {
        assert.ok(theme[fg], `no token --color-${fg}`);
        assert.ok(theme[bg], `no token --color-${bg}`);
        const r = ratio(theme[fg], theme[bg]);
        assert.ok(
          r >= 4.5,
          `${fg} (${theme[fg]}) on ${bg} (${theme[bg]}) is ${r.toFixed(2)}:1, under the 4.5:1 needed for text`,
        );
      });
    }
    for (const [what, fg, bg] of UI_PAIRS) {
      test(`${what} is visible`, () => {
        const r = ratio(theme[fg], theme[bg]);
        assert.ok(
          r >= 3,
          `${fg} (${theme[fg]}) on ${bg} (${theme[bg]}) is ${r.toFixed(2)}:1, under the 3:1 needed for a UI part`,
        );
      });
    }
  });
}

describe("token discipline", () => {
  test("nothing uses text-white, which is the dark card surface", () => {
    // Tailwind v4 compiles text-white to var(--color-white), and globals.css
    // redefines that as the raised card in dark mode — so `bg-brand-500
    // text-white` rendered dark red on near-black. text-onaccent is the
    // foreground half and it never inverts.
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".next") continue;
          walk(p);
        } else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          src.split("\n").forEach((line, i) => {
            if (/\btext-white\b/.test(line)) offenders.push(`${p}:${i + 1}`);
          });
        }
      }
    };
    walk(new URL("../components", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    walk(new URL("../app", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    assert.deepEqual(offenders, [], `use text-onaccent instead:\n  ${offenders.join("\n  ")}`);
  });

  test("filled accent controls do not use the inverting brand scale", () => {
    // bg-brand-600 lightens in dark mode so text-brand-600 stays legible, which
    // dropped every button's hover state to 4.08:1. hover:bg-accent-strong.
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".next") continue;
          walk(p);
        } else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          src.split("\n").forEach((line, i) => {
            if (/\bhover:bg-brand-600\b/.test(line)) offenders.push(`${p}:${i + 1}`);
          });
        }
      }
    };
    walk(new URL("../components", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    walk(new URL("../app", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    assert.deepEqual(offenders, [], `use hover:bg-accent-strong instead:\n  ${offenders.join("\n  ")}`);
  });

  test("the viewport does not disable pinch-zoom", () => {
    const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    assert.ok(
      !/maximumScale\s*:\s*1\b/.test(layout),
      "maximumScale: 1 blocks pinch-zoom for everyone (WCAG 1.4.4) — iOS focus zoom is handled by the 16px rule in globals.css",
    );
  });
});
