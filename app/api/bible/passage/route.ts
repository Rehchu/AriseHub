import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider, providerForTranslation } from "@/lib/bible";

// GET /api/bible/passage?ref=John+3:16&translation=web&provider=bible-api
//
// Fetches a passage for a signed-in user. Passage caching (Supabase bible_cache)
// and the keyed providers land in the next increment; for now this serves the
// keyless sources directly.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get("ref") || "").trim();
  if (!ref) return NextResponse.json({ error: "missing ref" }, { status: 400 });
  const translation = searchParams.get("translation") || undefined;
  const providerId = searchParams.get("provider");

  try {
    // The reader sends a Bible, not a provider — look up whichever provider
    // serves that translation and use it.
    const provider =
      (translation ? await providerForTranslation(translation) : null) ??
      getProvider(providerId);
    const passage = await provider.getPassage(ref, translation);
    return NextResponse.json(passage);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 502 },
    );
  }
}
