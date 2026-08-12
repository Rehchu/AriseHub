import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { annotationsFor, getProvider, providerForTranslation } from "@/lib/bible";

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

    // Study notes should be there whatever Bible was picked. If the selected
    // one carries none, borrow them and say where they came from.
    if (!passage.footnotes?.length) {
      const { footnotes, from } = await annotationsFor(ref);
      if (footnotes.length) {
        passage.footnotes = footnotes;
        passage.footnotesFrom = from;
      }
    }
    return NextResponse.json(passage);
  } catch (e) {
    // Provider errors are for the logs, not the reader. "WLDEH 404" tells a
    // volunteer nothing; "this Bible doesn't have that passage" tells them what
    // to do next. Not every translation carries every book — plenty are New
    // Testament only — so a 404 here is ordinary, not a fault.
    const raw = e instanceof Error ? e.message : "lookup failed";
    let message = raw;
    if (/\b404\b/.test(raw)) {
      message = "This Bible doesn't include that passage — try another translation.";
    } else if (/\b(5\d\d)\b/.test(raw)) {
      message = "That Bible's source is unavailable right now — try another translation.";
    } else if (/\b(401|403)\b/.test(raw)) {
      message = "That Bible isn't available with the current licence.";
    }
    return NextResponse.json({ error: message, detail: raw }, { status: 502 });
  }
}
