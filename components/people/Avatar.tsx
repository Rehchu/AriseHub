"use client";

import { useSignedUrl } from "@/lib/storage-url";

// Profile photos land in attachments, person photos in photos.
const PHOTO_BUCKETS = ["attachments", "photos"];

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * A person's photo, falling back to their initials.
 *
 * Photos live in a private bucket, so the stored value is an object path that
 * has to be signed before it can be displayed; older rows still hold a full
 * public URL and useSignedUrl handles both. While signing — and if it fails —
 * we show initials, which is what the whole directory used to show.
 */
export function Avatar({
  name,
  photo,
  size = 44,
  className = "",
}: {
  name: string;
  photo?: string | null;
  size?: number;
  className?: string;
}) {
  const resolved = useSignedUrl(PHOTO_BUCKETS, photo);
  // A directory of 200 faces should not pull 200 full-size photos.
  const url =
    resolved && resolved.startsWith("/api/files/") ? `${resolved}?thumb=1` : resolved;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ${className}`}
    >
      {initials(name)}
    </span>
  );
}
