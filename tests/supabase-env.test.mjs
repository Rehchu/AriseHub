// Pins how the Supabase publishable key is read, because getting it wrong is
// invisible until a deploy.
//
// Two facts make this worth a test rather than a comment:
//
// 1. Supabase renamed the anon key to the publishable key. They are the same
//    value, and a build environment configured before the rename supplies only
//    the old name. Reading one name leaves the key undefined, which compiles
//    and typechecks clean and then dies prerendering /login — the failure that
//    kept deploy.yml red for every one of its runs (see CLAUDE.md).
//
// 2. Next inlines NEXT_PUBLIC_* by replacing the literal text
//    `process.env.NEXT_PUBLIC_…` at build time. A dynamic read — process.env[n],
//    destructuring, a name built from a variable — is not replaced, so it comes
//    out undefined in the browser bundle however the environment is set. That
//    looks like a tidier way to write "try both names" and is a silent break.
//
// So this asserts on the source text of lib/supabase/env.ts: both literals
// present, no dynamic lookup. It is the one rule a runtime test cannot check,
// since by then the build has already decided.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("../lib/supabase/env.ts", import.meta.url)),
  "utf8",
);

// The "never do it this way" checks below must read code, not prose — the file
// explains the trap in a comment, and a comment saying not to write something
// should not read as writing it.
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the Supabase key is read under both of its names", () => {
  test("the current name is read as a literal expression", () => {
    assert.ok(
      code.includes("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      "the app's own name for the key must be read first",
    );
  });

  test("the pre-rename name is read as a literal expression too", () => {
    assert.ok(
      code.includes("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      "an environment set up before the rename supplies only this name",
    );
  });

  test("the URL is read as a literal expression", () => {
    assert.ok(code.includes("process.env.NEXT_PUBLIC_SUPABASE_URL"));
  });
});

describe("and never through a lookup Next cannot inline", () => {
  test("no computed process.env access", () => {
    assert.equal(
      /process\.env\s*\[/.test(code),
      false,
      "process.env[name] is not replaced at build time — it is undefined in the browser",
    );
  });

  test("no destructuring of process.env", () => {
    assert.equal(
      /(?:const|let|var)\s*\{[^}]*\}\s*=\s*process\.env/.test(code),
      false,
      "destructuring is not replaced at build time either",
    );
  });
});

describe("a missing key says what to set", () => {
  // The old failure named neither variable, which is most of why it cost a
  // session to work out. Whatever the wording, the message has to carry the
  // variable names and the fact that they are needed at BUILD time — setting
  // them as Worker secrets alone does nothing for a prerender.
  test("the error text names the variables and the build", () => {
    assert.ok(code.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"));
    assert.ok(/BUILD time|build time/.test(code));
    assert.ok(
      /Workers Builds/.test(code),
      "the second build path is the one people forget",
    );
  });
});

describe("the production values are committed, so a bare checkout builds", () => {
  // This is the fix for the fault that kept BOTH Cloudflare Workers Builds red:
  // their build-variables screen was never filled in, and a NEXT_PUBLIC_* name
  // that is unset at build time is unset in the bundle forever. Baking the two
  // public values in means a clean checkout builds with no environment at all.
  // If either default is ever removed, the build silently goes back to needing
  // dashboard state that nobody can see from the repository.
  test("the project URL is committed as a literal", () => {
    // Matched against `source`, not `code`: the comment stripper above removes
    // everything after a `//`, which inside a URL literal means the value
    // itself. Anchoring on the declaration keeps that from weakening the check —
    // a commented-out URL would not begin with `const DEFAULT_URL =`.
    assert.match(
      source,
      /const DEFAULT_URL = "https:\/\/[a-z0-9]+\.supabase\.co";/,
      "a default project URL must be committed, not left to the environment",
    );
    assert.ok(code.includes("DEFAULT_URL"), "and actually read, not just declared");
  });

  test("the publishable key is committed as a literal", () => {
    assert.match(
      code,
      /"sb_publishable_[A-Za-z0-9_-]+"/,
      "a default publishable key must be committed — it is public, and the " +
        "build cannot ask a dashboard for it",
    );
  });
});

describe("but a build aimed elsewhere must bring its own key", () => {
  // Falling back to the committed production key while pointed at another
  // project would authenticate against the wrong database and fail as anything
  // but a configuration mistake. Refusing is the whole value of the defaults
  // being safe to commit.
  test("a custom URL with no custom key is refused", () => {
    assert.match(
      code,
      /ENV_URL\s*&&\s*ENV_URL\s*!==\s*DEFAULT_URL\s*&&\s*!ENV_PUBLISHABLE_KEY/,
      "the two must be checked together, not defaulted independently",
    );
    assert.match(code, /throw new Error\(/);
  });

  test("both accessors run the check", () => {
    assert.equal(
      (code.match(/assertCoherent\(\);/g) ?? []).length,
      2,
      "supabaseUrl() and supabasePublishableKey() must both refuse a half-set environment",
    );
  });
});

describe("and nowhere else reads those names raw", () => {
  // The committed defaults live in lib/supabase/env.ts, so a file reading
  // process.env.NEXT_PUBLIC_SUPABASE_URL directly gets undefined wherever the
  // environment does not set it — which, now that the defaults exist, is the
  // normal case rather than the broken one. That is not theoretical: it is why
  // POST /api/agent/token answered 500 and no agent could trade its key for a
  // session, while the build itself was perfectly green.
  const ROOT = fileURLToPath(new URL("..", import.meta.url));
  const SKIP = new Set(["node_modules", ".next", ".open-next", ".git", "tests", "arise-it-portal", "tools"]);

  function sources(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) sources(full, out);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  }

  test("only lib/supabase/env.ts names them", () => {
    const raw = /process\.env\.NEXT_PUBLIC_SUPABASE_(?:URL|PUBLISHABLE_KEY|ANON_KEY)/;
    const offenders = sources(ROOT)
      .filter((f) => !f.endsWith(join("lib", "supabase", "env.ts")))
      .filter((f) => raw.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length));
    assert.deepEqual(
      offenders,
      [],
      "read the project URL and key through supabaseUrl() / supabasePublishableKey() " +
        "so the committed defaults apply — a raw read is undefined without an environment",
    );
  });
});
