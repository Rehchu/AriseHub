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
import { readFileSync } from "node:fs";
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
