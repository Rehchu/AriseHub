import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@/lib/supabase/server";

// POST { reference, text } -> a plain-language PARAPHRASE via Cloudflare Workers
// AI. This is NEVER scripture. The response is explicitly flagged a paraphrase,
// and the reader UI always shows the real verse next to it — the doc treats that
// labeling as non-negotiable, and so does this endpoint.
//
// Uses the AI binding (wrangler.jsonc "ai": { "binding": "AI" }), reached the
// same way as the R2 MEDIA binding in app/api/files/*.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

type WorkersAI = { run: (model: string, input: unknown) => Promise<{ response?: string }> };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { reference, text } = (await req.json().catch(() => ({}))) as {
    reference?: string;
    text?: string;
  };
  if (!text || text.trim().length < 3) {
    return NextResponse.json({ error: "no text" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const ai = (env as unknown as { AI?: WorkersAI }).AI;
  if (!ai) return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  try {
    const out = await ai.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You restate Bible passages in simple, plain modern English so they are easier to understand. You never present your wording as scripture, never add doctrine, interpretation, or commentary, and never change the meaning. Reply with only the plain-language restatement.",
        },
        {
          role: "user",
          content:
            `Restate this passage in simple, plain English a child could follow — 1 to 3 short sentences, faithful to the meaning:\n\n` +
            `${reference ? `(${reference}) ` : ""}${text.trim()}`,
        },
      ],
      max_tokens: 300,
    });
    const paraphrase = (out.response || "").trim();
    if (!paraphrase) return NextResponse.json({ error: "empty result" }, { status: 502 });
    // isParaphrase is a contract for the client: render this as a labeled
    // paraphrase, never as the verse text itself.
    return NextResponse.json({ paraphrase, isParaphrase: true, model: MODEL });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ai failed" },
      { status: 502 },
    );
  }
}
