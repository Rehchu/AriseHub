// YouTube links, as people actually paste them.
//
// The archive stores whatever URL was pasted — a watch link, a share link, a
// live URL, sometimes with a playlist or a start time attached. Everything
// downstream needs the bare video id, so the parsing happens once, here.

/** Pull the 11-character video id out of any common YouTube URL (or an id). */
export function youtubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Already just an id.
  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;

  const v = url.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;

  // /embed/ID, /live/ID, /shorts/ID, /v/ID
  const m = url.pathname.match(/\/(?:embed|live|shorts|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/**
 * Embed URL for the player.
 *
 * enablejsapi is what lets a transcript line seek the video: without it the
 * iframe ignores postMessage commands. origin is set so the player only accepts
 * messages from this app.
 */
export function youtubeEmbedUrl(id: string, origin?: string): string {
  const params = new URLSearchParams({ enablejsapi: "1", rel: "0", playsinline: "1" });
  if (origin) params.set("origin", origin);
  return `https://www.youtube.com/embed/${id}?${params}`;
}

/** 3725 -> "1:02:05"; 125 -> "2:05". For transcript timestamps. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}
