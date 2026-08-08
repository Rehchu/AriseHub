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

/** Every .tsx/.ts under components/ and app/, as [path, source]. */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        out.push([p, fs.readFileSync(p, "utf8")]);
      }
    }
  };
  const abs = (rel) =>
    new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  walk(abs("../components"));
  walk(abs("../app"));
  return out;
}

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
const UI_PAIRS = [
  ["focus ring against a card", "accent", "white"],
  // The care/task board priority stripe. These were three hardcoded hex values
  // and the ranking inverted in dark mode: high fell to 2.82:1 while low rose
  // to 6.40:1, so urgent hospital visits receded exactly where low-priority
  // items stood out.
  // Only the two that carry an "act on this" signal are held to 3:1. `low` is
  // deliberately the quiet end — it means no emphasis — and sits at ink-200,
  // which is a hairline by design. What matters is that high is the loudest of
  // the three in BOTH themes, which is the property that broke.
  ["priority stripe — high", "accent", "white"],
  ["priority stripe — normal", "ink-400", "white"],
  // An unticked checkbox's border is the whole control. ink-300 is a hairline
  // colour and measured 2.10:1 in dark.
  ["unticked checkbox border", "ink-400", "white"],
  ["ticked checkbox fill", "emerald-700", "white"],
];

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

  test("no literal colours in style props", () => {
    // A hex in a style prop cannot participate in token redefinition, so it
    // holds still while the surface under it flips. That is how the care board
    // ended up with its priority ranking inverted in dark mode.
    //
    // A colour that comes from DATA is fine — an event type's colour is chosen
    // by a person and stored in a row, so it is not the theme's business.
    const offenders = [];
    for (const [p, src] of sources()) {
      src.split("\n").forEach((line, i) => {
        if (!/style=\{\{/.test(line)) return;
        if (!/#[0-9a-fA-F]{6}\b/.test(line)) return;
        // `?? "#d97706"` style fallbacks behind a data-driven value.
        if (/\?\?\s*"#[0-9a-fA-F]{6}"/.test(line)) return;
        offenders.push(`${p}:${i + 1}`);
      });
    }
    assert.deepEqual(
      offenders,
      [],
      `use a token class instead — a literal here won't invert in dark mode:\n  ${offenders.join("\n  ")}`,
    );
  });

  test("ink-300 is never the whole of a control's boundary", () => {
    // ink-300 is the hairline/divider step: 2.76:1 light, 2.10:1 dark. Fine for
    // a rule between rows, not for the border that IS an unticked checkbox or
    // the colour of an icon-only button.
    const offenders = [];
    for (const [p, src] of sources()) {
      src.split("\n").forEach((line, i) => {
        if (!/\b(border-ink-300|text-ink-300)\b/.test(line)) return;
        if (!/<button|role="button"|cursor-pointer|onClick/.test(line)) return;
        offenders.push(`${p}:${i + 1}`);
      });
    }
    assert.deepEqual(
      offenders,
      [],
      `ink-300 is a hairline colour and misses the 3:1 a control needs — use ink-400:\n  ${offenders.join("\n  ")}`,
    );
  });

  test("the priority stripe survives both themes", () => {
    // What actually broke: with hardcoded hex, `high` fell to 2.82:1 in dark —
    // under the 3:1 a 3px non-text indicator needs — while `low` rose to 6.40:1
    // and became the loudest line on the board.
    //
    // Note what is NOT asserted. In light mode accent measures 4.97 and ink-400
    // measures 5.07, so `high` is not the higher contrast ratio of the two.
    // That is fine: what makes the red stripe read as urgent is hue, and
    // contrast ratio cannot see hue. The measurable properties are that high
    // clears the non-text minimum everywhere, and that low stays the quiet one.
    for (const [themeName, theme] of [["light", LIGHT], ["dark", DARK]]) {
      const on = (tok) => ratio(theme[tok], theme.white);
      assert.ok(
        on("accent") >= 3,
        `${themeName}: high-priority stripe is ${on("accent").toFixed(2)}:1, under the 3:1 a non-text indicator needs`,
      );
      assert.ok(
        on("ink-200") < on("ink-400"),
        `${themeName}: low (${on("ink-200").toFixed(2)}) is louder than normal (${on("ink-400").toFixed(2)}) — the ranking has inverted`,
      );
    }
  });

  test("the viewport does not disable pinch-zoom", () => {
    const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    assert.ok(
      !/maximumScale\s*:\s*1\b/.test(layout),
      "maximumScale: 1 blocks pinch-zoom for everyone (WCAG 1.4.4) — iOS focus zoom is handled by the 16px rule in globals.css",
    );
  });
});
