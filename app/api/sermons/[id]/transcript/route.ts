import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseTranscript } from "@/lib/vtt";

// POST { text, filename? } — parse a caption file and store its cues.
//
// Parsing happens here rather than in the browser so the timings are validated
// before anything is written: a file that yields no cues is rejected with a
// message, instead of silently producing an empty transcript.
//
// RLS is the real gate (sermon_transcript_cues is writable only by the services
// role); the role check below just turns a policy denial into a clear 403.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "Super_Admin" && role !== "Staff") {
    return NextResponse.json(
      { error: "Only staff can add a transcript." },
      { status: 403 },
    );
  }

  const { text, filename } = (await req.json().catch(() => ({}))) as {
    text?: string;
    filename?: string;
  };
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "The file was empty." }, { status: 400 });
  }

  const cues = parseTranscript(text, filename ?? "");
  if (cues.length === 0) {
    return NextResponse.json(
      {
        error:
          "No timed lines found. Upload a .vtt caption file, or text with [00:01:23] timestamps.",
      },
      { status: 400 },
    );
  }

  // Replace rather than append: uploading again is how a bad transcript gets
  // corrected, and appending would interleave two copies.
  const { error: delErr } = await supabase
    .from("sermon_transcript_cues")
    .delete()
    .eq("sermon_id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 502 });
  }

  // Chunked: a full service transcript can run to thousands of cues, which is
  // more than one insert should carry.
  const CHUNK = 500;
  for (let i = 0; i < cues.length; i += CHUNK) {
    const rows = cues.slice(i, i + CHUNK).map((c) => ({
      sermon_id: id,
      idx: c.idx,
      start_seconds: c.startSeconds,
      end_seconds: c.endSeconds ?? null,
      text: c.text,
    }));
    const { error } = await supabase.from("sermon_transcript_cues").insert(rows);
    if (error) {
      return NextResponse.json(
        { error: error.message, inserted: i },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true, cues: cues.length });
}
