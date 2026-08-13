import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allTranslations } from "@/lib/bible";

// GET /api/bible/translations[?all=1]
//
// ONE flat, alphabetical list of every Bible across every configured provider,
// de-duplicated — the reader shows Bibles, never providers. Restricted by
// default to the languages this church uses: English, plus the Greek and Hebrew
// source texts the ministers preach from. ?all=1 returns every language.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const filterLanguages = new URL(req.url).searchParams.get("all") !== "1";
  try {
    const translations = await allTranslations(filterLanguages);
    return NextResponse.json({ translations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 502 },
    );
  }
}
