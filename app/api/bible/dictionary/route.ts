import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/bible/dictionary?q=shepherd     — search by headword
//                          ?letter=s       — browse a letter
//                          ?slug=shepherd  — one full article
//
// The reading side of the dictionaries. The footer under a passage answers
// "what was written about these verses"; this answers "what is this word", and
// gives the whole article rather than the excerpt a footnote can hold.
export const ATTRIBUTION =
  "Easton's Bible Dictionary (1897) and Smith's Bible Dictionary (1863), public domain. Dataset: neuu-org/bible-dictionary-dataset, CC BY 4.0.";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug")?.trim();
  const q = searchParams.get("q")?.trim();
  const letter = searchParams.get("letter")?.trim().toLowerCase();

  // ── One article, in full, with everywhere it cites ───────────────────────
  if (slug) {
    const { data, error } = await supabase
      .from("dictionary_entries")
      .select("slug, name, sources, definitions, dictionary_refs(book, chapter, verse, original)")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry: data, attribution: ATTRIBUTION });
  }

  // ── Search, or browse a letter ───────────────────────────────────────────
  let query = supabase.from("dictionary_entries").select("slug, name, sources").order("name");

  if (q) {
    // ilike rather than the tsvector index: people search a dictionary by
    // prefix ("shep") far more than by whole word, and full-text would miss it.
    query = query.ilike("name", `${q.replace(/[%_]/g, "")}%`).limit(80);
  } else if (letter) {
    query = query.ilike("name", `${letter.slice(0, 1)}%`).limit(600);
  } else {
    query = query.limit(80);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ entries: data ?? [], attribution: ATTRIBUTION });
}
