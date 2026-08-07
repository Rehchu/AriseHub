"use client";

import { useSignedUrl } from "@/lib/storage-url";

/**
 * Renders a message attachment from the private `attachments` bucket.
 *
 * The stored value is an object path for anything sent after the bucket was
 * made private, and a legacy public URL for anything before it; useSignedUrl
 * handles both. While the signature is being fetched — or if it fails, which
 * is what someone who has lost access to the channel will see — we show a
 * neutral placeholder rather than a broken image.
 */
export function SignedAttachment({
  pathOrUrl,
  type,
  name,
}: {
  pathOrUrl: string;
  type?: string | null;
  name?: string | null;
}) {
  const url = useSignedUrl("attachments", pathOrUrl);
  const isImage = type?.startsWith("image/");

  if (!url) {
    return (
      <span className="mb-1 inline-block rounded-lg bg-ink-100 px-2 py-1 text-xs text-ink-400">
        {isImage ? "Loading image…" : (name ?? "Attachment")}
      </span>
    );
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name ?? "attachment"}
          className="mb-1 max-h-64 rounded-lg object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-200"
    >
      {name ?? "Download attachment"}
    </a>
  );
}
