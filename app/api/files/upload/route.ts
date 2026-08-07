import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@/lib/supabase/server";
import type { MediaBucket } from "@/lib/r2-types";


// 8 MB. Photos are compressed client-side to a few tens of KB; this is a
// backstop against someone posting a video, not a working limit.
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain)$/;

/**
 * Upload media to R2.
 *
 * R2 objects are not publicly reachable, so this is the only way in and
 * `/api/files/[...key]` is the only way out — both behind the session. That is
 * a stronger position than Supabase Storage signed URLs, where a signed link
 * still works for anyone it is forwarded to until it expires.
 *
 * Returns `{ key }`; callers store `r2:<key>` so the resolver knows where the
 * object lives.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "misc").replace(/[^a-z0-9/_-]/gi, "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.` },
      { status: 413 },
    );
  }
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.test(type)) {
    return NextResponse.json({ error: `${type} files aren't allowed here.` }, { status: 415 });
  }

  // Random prefix: keys must not be guessable from a person's id, and two
  // uploads of "photo.jpg" must not collide.
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-60);
  const key = `${folder || "misc"}/${crypto.randomUUID()}-${safeName}`;

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { MEDIA?: MediaBucket }).MEDIA;
  if (!bucket) {
    return NextResponse.json({ error: "media storage not configured" }, { status: 500 });
  }

  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: type, cacheControl: "private, max-age=31536000" },
    customMetadata: { uploadedBy: user.id },
  });

  // Optional small version, stored beside the original so the serve route can
  // find it by convention rather than needing another column.
  const thumb = form.get("thumb");
  if (thumb instanceof File && thumb.size > 0 && thumb.size < 512 * 1024) {
    await bucket.put(`${key}.thumb`, await thumb.arrayBuffer(), {
      httpMetadata: { contentType: "image/jpeg", cacheControl: "private, max-age=31536000" },
      customMetadata: { uploadedBy: user.id },
    });
  }

  return NextResponse.json({ key, ref: `r2:${key}` });
}
