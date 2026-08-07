"use client";

/**
 * Upload a file to R2 through /api/files/upload and get back the reference to
 * store (`r2:<key>`). The route checks the session, caps size and rejects
 * anything that is not an image, PDF or plain text.
 */
export async function uploadToR2(
  file: Blob,
  folder: string,
  filename: string,
): Promise<{ ref: string } | { error: string }> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("folder", folder);

  const res = await fetch("/api/files/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? `Upload failed (${res.status}).` };
  }
  const { ref } = (await res.json()) as { ref: string };
  return { ref };
}

/** Downscale before upload — a phone photo is ~4MB, an avatar needs ~40KB. */
export async function compressImage(file: File, maxDim = 900, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality),
    );
  } catch {
    // HEIC and friends can fail to decode — send the original rather than fail.
    return file;
  }
}
