// Transcript parsing for the sermon archive (F5).
//
// The church exports a caption file for each service. WebVTT is the format to
// prefer: its timings are unambiguous, so a transcript line can seek the video
// to the exact moment it was said. Plain text with [00:01:23] stamps is also
// accepted, because that is what some tools produce.
//
// YouTube's auto-captions are the awkward case. They scroll: each cue repeats
// the tail of the previous one so the words roll up the screen, which would
// otherwise fill the archive with duplicated half-sentences.

export interface TranscriptCue {
  /** Position in the file, 0-based. */
  idx: number;
  startSeconds: number;
  endSeconds?: number;
  text: string;
}

/** "00:01:23.456" | "01:23.456" | "00:01:23,456" -> seconds. */
export function parseTimestamp(stamp: string): number | null {
  const m = stamp.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const millis = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/** Strip caption markup: <v Speaker>, <c.colour>, <00:00:01.000> karaoke stamps. */
function stripCueTags(line: string): string {
  return line
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a WebVTT (or SRT-ish) transcript into timed cues.
 *
 * Returns [] rather than throwing on rubbish input — a bad upload should be
 * reported as "no cues found", not a stack trace.
 */
export function parseVtt(source: string): TranscriptCue[] {
  const text = source.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const blocks = text.split(/\n{2,}/);
  const cues: TranscriptCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    // Skip the header and comment/style blocks.
    if (/^WEBVTT/i.test(lines[0])) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(lines[0])) continue;

    const arrowAt = lines.findIndex((l) => l.includes("-->"));
    if (arrowAt === -1) continue;

    const [rawStart, rawRest] = lines[arrowAt].split("-->");
    if (!rawStart || !rawRest) continue;
    const startSeconds = parseTimestamp(rawStart);
    // Cue settings (align:start position:0%) trail the end stamp.
    const endSeconds = parseTimestamp(rawRest.trim().split(/\s+/)[0] ?? "");
    if (startSeconds === null) continue;

    const body = lines
      .slice(arrowAt + 1)
      .map(stripCueTags)
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!body) continue;

    cues.push({
      idx: cues.length,
      startSeconds,
      ...(endSeconds !== null ? { endSeconds } : {}),
      text: body,
    });
  }

  return dedupeRolling(cues);
}

/**
 * Parse plain text carrying [hh:mm:ss] or (mm:ss) stamps.
 *
 * Everything after a stamp, up to the next one, belongs to that stamp. Text
 * before the first stamp is dropped: without a time it can't be seeked to.
 */
export function parseTimestampedText(source: string): TranscriptCue[] {
  const text = source.replace(/\r\n?/g, "\n");
  const re = /[[(]?((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)[\])]?\s*/g;
  const cues: TranscriptCue[] = [];
  let match: RegExpExecArray | null;
  let previous: { start: number; from: number } | null = null;

  const push = (start: number, raw: string) => {
    const body = stripCueTags(raw);
    if (body) cues.push({ idx: cues.length, startSeconds: start, text: body });
  };

  while ((match = re.exec(text))) {
    const seconds = parseTimestamp(match[1]);
    if (seconds === null) continue;
    if (previous) push(previous.start, text.slice(previous.from, match.index));
    previous = { start: seconds, from: re.lastIndex };
  }
  if (previous) push(previous.start, text.slice(previous.from));

  return dedupeRolling(cues);
}

/** Pick the right parser for a file. */
export function parseTranscript(source: string, filename = ""): TranscriptCue[] {
  const looksVtt = /^﻿?WEBVTT/i.test(source.trimStart()) || source.includes("-->");
  if (looksVtt || /\.vtt$|\.srt$/i.test(filename)) {
    const cues = parseVtt(source);
    if (cues.length) return cues;
  }
  return parseTimestampedText(source);
}

/**
 * Collapse YouTube's rolling captions.
 *
 * Auto-generated cues repeat the previous cue's tail so words scroll up the
 * screen. Left alone the archive fills with duplicated fragments, and a search
 * hits the same sentence five times. A cue whose text merely extends the one
 * before it replaces it, keeping the earlier (correct) start time.
 */
function dedupeRolling(cues: TranscriptCue[]): TranscriptCue[] {
  const out: TranscriptCue[] = [];
  for (const cue of cues) {
    const last = out[out.length - 1];
    if (last) {
      if (last.text === cue.text) {
        // Exact repeat: keep the longer span, drop the duplicate.
        if (cue.endSeconds !== undefined) last.endSeconds = cue.endSeconds;
        continue;
      }
      if (cue.text.startsWith(last.text + " ")) {
        last.text = cue.text;
        if (cue.endSeconds !== undefined) last.endSeconds = cue.endSeconds;
        continue;
      }
    }
    out.push({ ...cue, idx: out.length });
  }
  return out;
}
