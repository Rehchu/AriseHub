import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseReference } from "@/lib/bible";

// GET /api/bible/reference?ref=John+3:16
//
// Which dictionary entries discuss the passage on screen.
//
// This runs the dictionaries backwards. The usual question is "what does this
// word mean"; the useful one under a passage is "what did Easton and Smith have
// to say about these verses", which the dataset supports because every entry
// ships its scripture citations. A whole-chapter read matches the chapter's
// entries; a verse range narrows to those verses plus any citation of the
// chapter as a whole.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ref = (new URL(req.url).searchParams.get("ref") || "").trim();
  if (!ref) return NextResponse.json({ error: "missing ref" }, { status: 400 });

  const p = parseReference(ref);
  if (!p) return NextResponse.json({ entries: [] });

  let q = supabase
    .from("dictionary_refs")
    .select("verse, original, dictionary_entries!inner(slug, name, sources, definitions)")
    .eq("book", p.osis)
    .eq("chapter", p.chapter)
    .limit(60);

  // A verse range asks for those verses. Citations with no verse point at the
  // whole chapter and stay relevant either way, so they are kept.
  if (p.verseFrom !== undefined && !p.chapterTo) {
    const to = p.verseTo ?? p.verseFrom;
    q = q.or(`and(verse.gte.${p.verseFrom},verse.lte.${to}),verse.is.null`);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  // One entry can cite the same chapter several times; show it once, keeping
  // the verse it was matched on so the reader can say why it is there.
  const seen = new Map<
    string,
    { slug: string; name: string; sources: string[]; verses: number[]; excerpt: string }
  >();
  for (const row of data ?? []) {
    const e = row.dictionary_entries as unknown as {
      slug: string;
      name: string;
      sources: string[];
      definitions: { source: string; text: string }[];
    };
    if (!e) continue;
    const hit = seen.get(e.slug) ?? {
      slug: e.slug,
      name: e.name,
      sources: e.sources ?? [],
      verses: [],
      // Footnotes get an excerpt, not the whole article — some Easton entries
      // run for pages. The full text is a click away in the dictionary view.
      excerpt: (e.definitions?.[0]?.text ?? "").slice(0, 240),
    };
    if (row.verse != null && !hit.verses.includes(row.verse)) hit.verses.push(row.verse);
    seen.set(e.slug, hit);
  }

  const entries = [...seen.values()]
    .map((e) => ({ ...e, verses: e.verses.sort((a, b) => a - b) }))
    .sort((a, b) => (a.verses[0] ?? 0) - (b.verses[0] ?? 0) || a.name.localeCompare(b.name));

  return NextResponse.json({
    entries,
    // CC BY 4.0 requires attribution, and the works themselves deserve naming.
    attribution:
      "Easton's Bible Dictionary (1897) and Smith's Bible Dictionary (1863), public domain. Dataset: neuu-org/bible-dictionary-dataset, CC BY 4.0.",
  });
}
