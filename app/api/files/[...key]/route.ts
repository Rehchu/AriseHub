import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@/lib/supabase/server";
import type { MediaBucket } from "@/lib/r2-types";

/** Fire-and-forget on the Worker's execution context when one is available. */
function ctxWaitUntil(p: Promise<unknown>) {
  try {
    const c = getCloudflareContext().ctx as { waitUntil?: (p: Promise<unknown>) => void };
    if (c?.waitUntil) return c.waitUntil(p);
  } catch {
    /* no context (build/dev) — fall through */
  }
  void p;
}


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
  const baseKey = parts.map(decodeURIComponent).join("/");
  // ?thumb=1 asks for the small version; fall back to the original if this
  // object predates thumbnails.
  const wantThumb = req.nextUrl.searchParams.get("thumb") === "1";
  const key = wantThumb ? `${baseKey}.thumb` : baseKey;

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { MEDIA?: MediaBucket }).MEDIA;
  if (!bucket) return new NextResponse("media storage not configured", { status: 500 });

  // Colo cache, checked only AFTER the session check above — the cache key is
  // the object URL, and every request still has to be authenticated to reach
  // this line. Repeat views of a photo skip R2 entirely.
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(req.nextUrl.toString(), { method: "GET" });
  const range = req.headers.get("range");
  if (cache && !range) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set("x-cache", "hit");
      // The stored copy is marked public so Cloudflare will keep it; what goes
      // back to the browser must stay private, or a shared proxy could hold on
      // to someone's photo.
      h.set("cache-control", "private, max-age=31536000, immutable");
      return new NextResponse(hit.body, { status: hit.status, headers: h });
    }
  }

  const object = await bucket.get(key, {
    range: range ? req.headers : undefined,
    onlyIf: req.headers,
  });

  if (!object) {
    // A thumbnail may simply not exist for older uploads.
    if (wantThumb) {
      const original = await bucket.get(baseKey, { onlyIf: req.headers });
      if (original?.body) {
        const h = new Headers();
        original.writeHttpMetadata(h);
        h.set("cache-control", "private, max-age=31536000, immutable");
        return new NextResponse(original.body, { status: 200, headers: h });
      }
    }
    return new NextResponse("not found", { status: 404 });
  }

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

  const [toCache, toSend] = object.body.tee();
  if (cache) {
    // Cloudflare refuses to store a response marked private, so the copy kept
    // in the colo cache drops that header. Safe: the cache key is this URL with
    // its UUID, and nothing reads it without passing the session check above.
    // The browser still receives the private version.
    const cacheHeaders = new Headers(headers);
    cacheHeaders.set("cache-control", "public, max-age=31536000, immutable");
    ctxWaitUntil(
      cache.put(cacheKey, new NextResponse(toCache, { status: 200, headers: cacheHeaders })),
    );
  } else {
    void toCache.cancel();
  }
  return new NextResponse(toSend, { status: 200, headers });
}
