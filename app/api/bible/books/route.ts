import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bibleBooks } from "@/lib/bible";

// GET /api/bible/books — the 66 books with chapter counts, for the reader's
// book/chapter navigation. Signed-in users only.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ books: await bibleBooks() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 502 },
    );
  }
}
