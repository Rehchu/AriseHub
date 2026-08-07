import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@/lib/supabase/server";
import type { MediaBucket } from "@/lib/r2-types";


/**
 * Serve an R2 object to a signed-in person.
 *
 * R2 buckets are private, so this route is the only way to read one. Every
 * request is checked against the session — unlike a signed URL, access ends
 * the moment someone is removed, rather than whenever the signature expires.
 *
 * Supports Range so images and PDFs stream, and ETag so repeat views are 304s.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { MEDIA?: MediaBucket }).MEDIA;
  if (!bucket) return new NextResponse("media storage not configured", { status: 500 });

  const range = req.headers.get("range");
  const object = await bucket.get(key, {
    range: range ? req.headers : undefined,
    onlyIf: req.headers,
  });

  if (!object) return new NextResponse("not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // Private: caches must not hand this to the next person on the network.
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");

  // onlyIf matched (a conditional GET) — nothing to send.
  if (!("body" in object) || !object.body) {
    return new NextResponse(null, { status: 304, headers });
  }

  // Only a request that actually asked for a range gets 206 — R2 reports a
  // range on plain gets too, and an unsolicited 206 confuses some clients.
  // R2 reports a range on ordinary gets too, so 206 is only correct when the
  // client asked for one AND what came back is genuinely a slice.
  const r = object.range && "offset" in object.range ? object.range : null;
  const start = r?.offset ?? 0;
  const length = r?.length ?? object.size - start;
  if (range && r && length < object.size) {
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${object.size}`);
    return new NextResponse(object.body, { status: 206, headers });
  }

  return new NextResponse(object.body, { status: 200, headers });
}
