// Person photos (children and parents), stored in Supabase Storage.
//
// A photo on a child's badge — and on the guardian's claim tag — is a real
// child-safety control at pickup: staff can match face to tag rather than
// relying on a code alone.
//
// Requires a PRIVATE Storage bucket named `photos`. Photos of children are
// never world-readable; display goes through a short-lived signed URL
// (lib/storage-url.ts).

import { createClient } from "@/lib/supabase/client";
import { signedUrl } from "@/lib/storage-url";

const BUCKET = "photos";

/** Downscale before upload — phone photos are ~4 MB, a badge needs ~40 KB. */
export async function compressImage(file: File, maxDim = 600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      "image/jpeg",
      quality,
    );
  });
}

export interface UploadedPhoto {
  url: string;
  path: string;
}

/** Upload a person's photo. Returns a signed display URL and the storage path. */
export async function uploadPersonPhoto(
  file: File,
  profileId: string,
): Promise<UploadedPhoto | { error: string }> {
  const supabase = createClient();
  try {
    const blob = await compressImage(file);
    const path = `people/${profileId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) {
      return {
        error: /bucket/i.test(error.message)
          ? "Photo storage isn't set up yet — create a private bucket named 'photos' in Supabase."
          : error.message,
      };
    }
    // Signed, not public: the bucket holds photos of children.
    const url = await signedUrl(BUCKET, path);
    return { url: url ?? path, path };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not upload the photo." };
  }
}

/** Read a File as a data URL for instant preview before upload. */
export function previewUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}
