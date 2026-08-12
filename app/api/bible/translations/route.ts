import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/bible";

// GET /api/bible/translations?provider=bible-api
// Lists the translations the (configured) provider offers, English first since
// that's the church's language. Signed-in users only.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const providerId = new URL(req.url).searchParams.get("provider");
  try {
    const provider = getProvider(providerId);
    const all = await provider.translations();
    const english = all.filter((t) => (t.language ?? "").toLowerCase() === "english");
    return NextResponse.json({
      provider: provider.id,
      translations: english.length ? english : all,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 502 },
    );
  }
}
