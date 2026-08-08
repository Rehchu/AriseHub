// Barcode + QR rendering for name tags.
//
// Why this exists: the check-in security code is what pairs a child's badge to
// the guardian's claim tag at pickup. Until now it printed as Courier text that
// a volunteer had to read and compare by eye. Rendering it as a scannable code
// is the single biggest utility win available on a thermal printer — DYMO
// LabelWriters print black-only, so 1-bit codes are exactly what they're good at.
//
// QR comes from `qrcode-generator` (MIT, Kazuhiko Arase) — a well-proven
// encoder. Code 128 is implemented here because it's a lookup table plus a
// mod-103 checksum, and having it inline means we control bar geometry exactly
// at print DPI instead of scaling someone else's raster.

import qrcode from "qrcode-generator";

export type CodeFormat = "qr" | "code128";

/** Error-correction level for QR. Higher survives more toner spatter, costs size. */
export type QrEcc = "L" | "M" | "Q" | "H";

// ---------------------------------------------------------------------------
// Code 128
// ---------------------------------------------------------------------------

// Symbol patterns, values 0–106. Each is bar/space widths in modules, starting
// with a bar: "212222" = bar 2, space 1, bar 2, space 2, bar 2, space 2.
// Index 106 is the stop pattern and is 7 elements, not 6.
const C128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const C128_START_B = 104;
const C128_START_C = 105;
const C128_STOP = 106;

/**
 * Encode a string as Code 128 and return the bar/space widths in modules.
 *
 * Code C (two digits per symbol) is used when the payload is all digits and of
 * even length — that halves the width, which matters on a 1-inch label. Every
 * other payload uses Code B, which covers printable ASCII 32–126. Characters
 * outside that range can't be represented and become '?' rather than silently
 * producing a barcode that scans as something else.
 */
export function encodeCode128(input: string): { widths: number[]; startsWithBar: true } {
  const useC = /^\d+$/.test(input) && input.length % 2 === 0 && input.length > 0;
  const values: number[] = [];

  if (useC) {
    values.push(C128_START_C);
    for (let i = 0; i < input.length; i += 2) values.push(Number(input.slice(i, i + 2)));
  } else {
    values.push(C128_START_B);
    for (const ch of input) {
      const c = ch.charCodeAt(0);
      values.push(c >= 32 && c <= 126 ? c - 32 : "?".charCodeAt(0) - 32);
    }
  }

  // Checksum: start value + sum(position * value), mod 103. Position is 1-based
  // over the data symbols, and the start symbol counts as position 0.
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += i * values[i];
  values.push(sum % 103);
  values.push(C128_STOP);

  const widths: number[] = [];
  for (const v of values) for (const d of C128_PATTERNS[v]) widths.push(Number(d));
  return { widths, startsWithBar: true };
}

/**
 * Draw a Code 128 barcode into the box (x, y, w, h).
 *
 * The module width is snapped to a whole number of device pixels — a barcode
 * whose bars land on fractional pixels gets anti-aliased into grey, and a
 * thermal printer thresholds grey unpredictably. Snapping is the difference
 * between "scans first time" and "scans sometimes".
 */
export function drawCode128(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color = "#000000",
) {
  if (!value) return;
  const { widths } = encodeCode128(value);
  const totalModules = widths.reduce((a, b) => a + b, 0);
  if (totalModules === 0) return;

  const moduleW = Math.max(1, Math.floor(w / totalModules));
  const drawnW = moduleW * totalModules;
  // Centre whatever rounding left over, so the code sits where the box is.
  let cx = Math.round(x + (w - drawnW) / 2);

  ctx.fillStyle = color;
  let isBar = true;
  for (const units of widths) {
    const barW = units * moduleW;
    if (isBar) ctx.fillRect(cx, Math.round(y), barW, Math.round(h));
    cx += barW;
    isBar = !isBar;
  }
}

/** Width of a Code 128 symbol in modules — for laying out a quiet zone. */
export function code128Modules(value: string): number {
  if (!value) return 0;
  return encodeCode128(value).widths.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// QR
// ---------------------------------------------------------------------------

/**
 * Encode to UTF-8 before handing the string over.
 *
 * qrcode-generator's default byte converter takes the low byte of each JS char
 * code, so a pre-encoded UTF-8 binary string round-trips exactly. Passing a raw
 * JS string would mangle anything outside Latin-1 — a child called "José"
 * would encode wrong.
 */
function toBinaryString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

export interface QrMatrix {
  size: number;
  isDark: (row: number, col: number) => boolean;
}

/** Build the QR module matrix. Version is chosen automatically for the payload. */
export function encodeQr(value: string, ecc: QrEcc = "M"): QrMatrix | null {
  if (!value) return null;
  try {
    const qr = qrcode(0, ecc);
    qr.addData(toBinaryString(value), "Byte");
    qr.make();
    return { size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
  } catch {
    // Payload too long for even version 40 at this ECC level.
    return null;
  }
}

/**
 * Draw a QR code centred in the box (x, y, w, h), preserving its square aspect.
 *
 * `quietZone` is in modules; the spec requires 4 and scanners genuinely need it.
 * As with Code 128, module size is snapped to whole pixels.
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color = "#000000",
  ecc: QrEcc = "M",
  quietZone = 4,
) {
  const m = encodeQr(value, ecc);
  if (!m) return;

  const totalModules = m.size + quietZone * 2;
  const side = Math.min(w, h);
  const moduleSize = Math.max(1, Math.floor(side / totalModules));
  const drawn = moduleSize * totalModules;
  const ox = Math.round(x + (w - drawn) / 2);
  const oy = Math.round(y + (h - drawn) / 2);

  // The quiet zone must be light even when the label background isn't white,
  // otherwise the finder patterns lose their contrast ratio.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ox, oy, drawn, drawn);

  ctx.fillStyle = color;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.isDark(r, c)) continue;
      ctx.fillRect(
        ox + (c + quietZone) * moduleSize,
        oy + (r + quietZone) * moduleSize,
        moduleSize,
        moduleSize,
      );
    }
  }
}
