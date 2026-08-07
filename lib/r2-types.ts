// Minimal shape of the R2 binding we use. The full Workers types are not in
// this project's tsconfig (it compiles as a Next app), so this keeps the two
// media routes type-safe without pulling in @cloudflare/workers-types.
export interface MediaObjectBody {
  body?: ReadableStream | null;
  size: number;
  httpEtag: string;
  range?: { offset?: number; length?: number };
  writeHttpMetadata(headers: Headers): void;
}

export interface MediaBucket {
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(
    key: string,
    options?: { range?: Headers; onlyIf?: Headers },
  ): Promise<MediaObjectBody | null>;
  delete(key: string): Promise<void>;
}
