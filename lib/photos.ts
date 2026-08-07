// Person photos (children and parents), stored in Supabase Storage.
//
// A photo on a child's badge — and on the guardian's claim tag — is a real
// child-safety control at pickup: staff can match face to tag rather than
// relying on a code alone.
//
// Stored in Cloudflare R2 and served through /api/files, which checks the
// session on every request. Nothing here is ever publicly reachable.

import { uploadToR2 } from "@/lib/upload";


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
  try {
    const blob = await compressImage(file);
    const up = await uploadToR2(blob, "people", `${profileId}.jpg`);
    if ("error" in up) return up;
    // The ref is what gets stored and what the Avatar resolves.
    return { url: up.ref, path: up.ref };
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
