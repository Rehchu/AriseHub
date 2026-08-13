// Load the public-domain Bible dictionaries into Supabase.
//
//   node tools/import-dictionaries.mjs
//
// Source: neuu-org/bible-dictionary-dataset (CC BY 4.0; the dictionaries
// themselves — Easton's 1897 and Smith's 1863 — are public domain by age).
// ~6,000 entries and ~35,000 scripture citations.
//
// The citations arrive already normalized ("Gen. 1:14" -> "Genesis 1:14"), but
// they are re-parsed here with the app's OWN parseReference rather than trusted
// as strings. That guarantees the book codes stored are exactly the codes the
// reader looks up with; a citation this app cannot parse is dropped and counted
// rather than written in a form nothing will ever match.
//
// Idempotent: entries upsert on slug, and an entry's refs are replaced.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { parseReference } from "../lib/bible.ts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

const BASE = "https://raw.githubusercontent.com/neuu-org/bible-dictionary-dataset/HEAD/data/01_parsed";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("").filter((c) => c !== "x");

let entries = 0, refs = 0, unparseable = 0;
const unparseableExamples = new Set();

for (const letter of LETTERS) {
  const res = await fetch(`${BASE}/${letter}.json`);
  if (!res.ok) { console.log(`  ${letter}.json — ${res.status}, skipped`); continue; }
  const data = await res.json();

  const rows = Object.values(data).map((e) => ({
    slug: e.slug,
    name: e.name,
    definitions: e.definitions ?? [],
    sources: e.sources ?? [],
  }));

  // Upsert the entries, then read back the ids so the refs can point at them.
  const { data: saved, error } = await db
    .from("dictionary_entries")
    .upsert(rows, { onConflict: "slug" })
    .select("id, slug");
  if (error) throw new Error(`${letter}: ${error.message}`);
  entries += saved.length;

  const idBySlug = new Map(saved.map((r) => [r.slug, r.id]));
  await db.from("dictionary_refs").delete().in("entry_id", [...idBySlug.values()]);

  const refRows = [];
  for (const e of Object.values(data)) {
    const entryId = idBySlug.get(e.slug);
    if (!entryId) continue;
    for (const r of e.scripture_refs ?? []) {
      const p = parseReference(r.reference);
      if (!p) {
        unparseable++;
        if (unparseableExamples.size < 12) unparseableExamples.add(r.reference);
        continue;
      }
      refRows.push({
        entry_id: entryId,
        book: p.osis,
        chapter: p.chapter,
        verse: p.verseFrom ?? null,
        original: r.original ?? r.reference,
      });
    }
  }

  for (let i = 0; i < refRows.length; i += 500) {
    const { error: refErr } = await db.from("dictionary_refs").insert(refRows.slice(i, i + 500));
    if (refErr) throw new Error(`${letter} refs: ${refErr.message}`);
  }
  refs += refRows.length;
  console.log(`  ${letter}.json  ${String(saved.length).padStart(4)} entries  ${String(refRows.length).padStart(5)} refs`);
}

console.log(`\nentries: ${entries}\nrefs:    ${refs}\nunparseable citations dropped: ${unparseable}`);
if (unparseableExamples.size) console.log("  examples:", [...unparseableExamples].join(" | "));
