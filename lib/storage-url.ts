"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Private-media access.
 *
 * The `attachments` and `photos` buckets used to be public, which meant a
 * child's photo or a department's message attachment was readable by anyone
 * holding the URL — no login, forever, including people who had since been
 * removed from the department. The buckets are private now, so a URL is only
 * useful for as long as it is signed for.
 *
 * Records written before the change stored a full public URL. Those paths are
 * still valid inside the bucket, so we recover the object path from the URL
 * rather than migrating rows.
 */

const SIGNED_TTL_SECONDS = 60 * 60; // an hour — long enough to read a thread

/** `https://…/storage/v1/object/public/attachments/a/b.png` -> `a/b.png` */
export function objectPath(bucket: string, urlOrPath: string): string {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = urlOrPath.indexOf(marker);
  if (i !== -1) return decodeURIComponent(urlOrPath.slice(i + marker.length));
  const signed = urlOrPath.indexOf(`/storage/v1/object/sign/${bucket}/`);
  if (signed !== -1) {
    return decodeURIComponent(urlOrPath.slice(signed + `/storage/v1/object/sign/${bucket}/`.length).split("?")[0]);
  }
  return urlOrPath.replace(/^\/+/, "");
}

/**
 * Profile photos are uploaded to `attachments`, photos of children and parents
 * to `photos` — and both end up in profiles.photo_url. Rather than encode the
 * bucket in every row, try each in turn; the miss costs one request and only
 * happens for the second bucket.
 */
export async function signedUrl(
  bucket: string | string[],
  urlOrPath: string,
): Promise<string | null> {
  if (!urlOrPath) return null;
  // Data URLs are local previews — nothing to sign.
  if (urlOrPath.startsWith("data:") || urlOrPath.startsWith("blob:")) return urlOrPath;

  const supabase = createClient();
  const buckets = Array.isArray(bucket) ? bucket : [bucket];
  // A legacy public URL names its own bucket; trust that over the guess.
  const named = buckets.find((b) => urlOrPath.includes(`/object/public/${b}/`));
  for (const b of named ? [named] : buckets) {
    const { data, error } = await supabase.storage
      .from(b)
      .createSignedUrl(objectPath(b, urlOrPath), SIGNED_TTL_SECONDS);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

/**
 * Resolves a stored path (or a legacy public URL) to a signed URL for display.
 * Returns null while resolving and if signing fails, so callers can fall back
 * to initials or a placeholder rather than rendering a broken image.
 */
export function useSignedUrl(bucket: string | string[], urlOrPath: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (!urlOrPath) {
      setUrl(null);
      return;
    }
    signedUrl(bucket, urlOrPath).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(bucket), urlOrPath]);

  return url;
}
