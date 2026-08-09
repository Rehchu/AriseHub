// Name-tag design model + renderer.
//
// A template is a small scene graph. The station renders it to a PNG at print
// DPI, then sends that image to the DYMO (as an ImageObject) or to the browser
// print dialog. Rendering to an image means WYSIWYG — whatever the designer
// shows is exactly what prints, on any printer.
//
// UNITS. There are exactly two, and everything follows one of them:
//   * position/size (x, y, w, h) — a FRACTION of the label (0–1), so a design
//     survives being moved to a different label size.
//   * every other length (borderWidth, radius, letterSpacing, padding) — px at
//     96dpi, scaled by dpi/96 at render time.
//   * fontSize is the one exception: pt, scaled by the label height so type
//     keeps its proportion when the stock changes.
// The designer applies the same scaling with PX_PER_IN in place of dpi, so the
// stage and the printed label agree. They did not always — see LETTER_SPACING
// and BORDER notes below.

import { drawCode128, drawQr, type QrEcc } from "./barcode";

export type ElementKind = "text" | "rect" | "image" | "line" | "qr" | "barcode";

/** When an element is drawn at all. `always` is the default. */
export type ElementCondition =
  | "always"
  | "allergy"
  | "noAllergy"
  | "hasRoom"
  | "hasCode"
  | "guardianOnly"
  | "childOnly";

export interface TagElement {
  id: string;
  kind: ElementKind;
  // Position/size as a FRACTION of the label (0–1), so a design survives being
  // moved to a different label size.
  x: number;
  y: number;
  w: number;
  h: number;
  /** Editor-only label shown in the layers panel. Never printed. */
  name?: string;
  /** Locked elements can't be dragged, resized or deleted from the stage. */
  locked?: boolean;
  /** Hidden elements are skipped by both the stage and the renderer. */
  hidden?: boolean;
  // text
  text?: string; // supports the merge fields listed in MERGE_FIELDS
  fontFamily?: string;
  fontSize?: number; // pt at 1x label height
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  /** Vertical alignment within the element box. Defaults to middle. */
  valign?: "top" | "middle" | "bottom";
  letterSpacing?: number; // px at 96dpi
  // rect / line
  fill?: string; // "transparent" draws outline only
  radius?: number; // px at 96dpi
  // image
  src?: string; // data URL
  /** How an image fills its box. Defaults to contain. */
  fit?: "contain" | "cover" | "stretch";
  // borders (any element)
  borderWidth?: number; // px at 96dpi
  borderColor?: string;
  borderStyle?: "solid" | "dashed" | "dotted";
  // text extras
  uppercase?: boolean;
  lineHeight?: number; // multiplier, only meaningful with wrap
  /** Wrap long text onto multiple lines instead of shrinking it to one. */
  wrap?: boolean;
  /** Never shrink below this many pt when fitting. Defaults to 6. */
  minFontSize?: number;
  shape?: "rect" | "ellipse";
  // qr / barcode
  /** What to encode. Supports merge fields; defaults to {code}. */
  codeValue?: string;
  /** QR error correction. Higher survives a worse print. Defaults to M. */
  qrEcc?: QrEcc;
  /** Print the encoded value as text beneath a barcode. */
  showCodeText?: boolean;
  // shared
  rotation?: number;
  opacity?: number;
  /** Draw only when this holds. Defaults to always. */
  showIf?: ElementCondition;
  /**
   * Legacy form of `showIf: "allergy"`. Still honoured so existing templates
   * keep working; the editor writes `showIf` for anything new.
   */
  onlyIfAllergy?: boolean;
}

export interface TagDesign {
  background: string;
  backgroundImage?: string; // data URL
  /**
   * How the background image fills the label. Defaults to `contain`, which is
   * what the renderer has always done — the stage used to disagree and show
   * `cover`, so a design with a background printed differently than it looked.
   */
  backgroundFit?: "contain" | "cover" | "stretch";
  elements: TagElement[];
  /** Border drawn around the whole label. */
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  /**
   * Render in pure black & white. DYMO LabelWriters are thermal — they print
   * black only — so previewing in mono shows exactly what comes out.
   */
  monochrome?: boolean;
  /** Luminance cut for monochrome mode (0–255). Defaults to 160. */
  monochromeThreshold?: number;
  /** Editor-only: grid spacing in fractions of the label. Not printed. */
  gridSize?: number;
  /** Editor-only: snap dragging to the grid. Not printed. */
  snapToGrid?: boolean;
  /** Safe margin guide in inches, drawn in the editor only. Not printed. */
  safeMarginIn?: number;
}

/** Common DYMO label stock, so you can pick by name instead of measuring. */
export const LABEL_PRESETS: { id: string; name: string; w: number; h: number; note?: string }[] = [
  { id: "30252", name: "30252 Address", w: 3.5, h: 1.125, note: "most common" },
  { id: "30320", name: "30320 Address", w: 3.5, h: 1.125 },
  { id: "30321", name: "30321 Large Address", w: 3.5, h: 1.4375 },
  { id: "99012", name: "99012 Large Address (EU)", w: 3.5, h: 1.4375 },
  { id: "30256", name: "30256 Shipping (large)", w: 4, h: 2.3125 },
  { id: "namebadge", name: "Name badge 4 × 2.31", w: 4, h: 2.3125 },
  { id: "30323", name: "30323 Shipping", w: 4, h: 2.125 },
  { id: "30336", name: "30336 Multipurpose (small)", w: 2.125, h: 1 },
  { id: "30334", name: "30334 Multipurpose (medium)", w: 2.25, h: 1.25 },
  { id: "30333", name: "30333 Multipurpose 1/2 (x2)", w: 1, h: 1 },
];

export interface TagTemplate {
  id: string;
  name: string;
  width_in: number;
  height_in: number;
  design: TagDesign;
  is_default: boolean;
  kind: "child" | "guardian";
}

export interface TagValues {
  name: string;
  room: string;
  code: string;
  church: string;
  hasAllergy: boolean;
  /** What the allergy IS ("peanuts") — {allergy} prints this when present. */
  allergyNotes?: string;
  /** Optional extras — merge fields resolve to "" when these aren't supplied. */
  campus?: string;
  guardian?: string;
  service?: string;
  age?: string | number;
  /**
   * The moment the check-in happened. {date} and {time} render from this, not
   * from "now" — a badge reprinted on Monday must not claim to be Monday's.
   */
  checkedInAt?: string | Date;
}

/**
 * DPI everything renders at.
 *
 * The designer preview and the check-in station both use this, so "print
 * preview" means it. They used to pass 200 and 300 respectively, which — with
 * letter-spacing not scaling with DPI — made the preview a different shape from
 * the label that came out.
 */
export const PRINT_DPI = 300;

/** Always available, no network needed. */
export const SYSTEM_FONTS = [
  "system-ui",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Comic Sans MS",
  "Trebuchet MS",
  "Verdana",
];

/**
 * Fifty Google families, fetched only when one is actually used.
 *
 * Loading all fifty up front would pull megabytes of webfont onto a check-in
 * tablet before anyone has designed anything, so `loadFont` injects a stylesheet
 * per family on demand and `ensureFonts` waits for it before rasterising —
 * otherwise the canvas silently falls back and the printed label disagrees with
 * the screen, which is the one thing the preview exists to prevent.
 *
 * Chosen for a NAME BADGE read at arm's length across a room: heavy weights
 * available, wide apertures, unambiguous digits for the pickup code. Grouped so
 * the picker can label them.
 */
export const GOOGLE_FONTS: { name: string; group: "Sans" | "Serif" | "Display" | "Handwriting" | "Mono" }[] = [
  { name: "Poppins", group: "Sans" },
  { name: "Inter", group: "Sans" },
  { name: "Roboto", group: "Sans" },
  { name: "Open Sans", group: "Sans" },
  { name: "Lato", group: "Sans" },
  { name: "Montserrat", group: "Sans" },
  { name: "Nunito", group: "Sans" },
  { name: "Nunito Sans", group: "Sans" },
  { name: "Raleway", group: "Sans" },
  { name: "Work Sans", group: "Sans" },
  { name: "Rubik", group: "Sans" },
  { name: "Manrope", group: "Sans" },
  { name: "DM Sans", group: "Sans" },
  { name: "Outfit", group: "Sans" },
  { name: "Plus Jakarta Sans", group: "Sans" },
  { name: "Figtree", group: "Sans" },
  { name: "Quicksand", group: "Sans" },
  { name: "Barlow", group: "Sans" },
  { name: "Source Sans 3", group: "Sans" },
  { name: "Oswald", group: "Sans" },
  { name: "Fira Sans", group: "Sans" },
  { name: "Karla", group: "Sans" },
  { name: "Mulish", group: "Sans" },
  { name: "Cabin", group: "Sans" },
  { name: "Titillium Web", group: "Sans" },
  { name: "Playfair Display", group: "Serif" },
  { name: "Merriweather", group: "Serif" },
  { name: "Lora", group: "Serif" },
  { name: "PT Serif", group: "Serif" },
  { name: "Source Serif 4", group: "Serif" },
  { name: "Libre Baskerville", group: "Serif" },
  { name: "Crimson Text", group: "Serif" },
  { name: "Cormorant Garamond", group: "Serif" },
  { name: "EB Garamond", group: "Serif" },
  { name: "Bitter", group: "Serif" },
  { name: "Bebas Neue", group: "Display" },
  { name: "Anton", group: "Display" },
  { name: "Archivo Black", group: "Display" },
  { name: "Alfa Slab One", group: "Display" },
  { name: "Righteous", group: "Display" },
  { name: "Fredoka", group: "Display" },
  { name: "Baloo 2", group: "Display" },
  { name: "Luckiest Guy", group: "Display" },
  { name: "Bungee", group: "Display" },
  { name: "Pacifico", group: "Handwriting" },
  { name: "Caveat", group: "Handwriting" },
  { name: "Dancing Script", group: "Handwriting" },
  { name: "Satisfy", group: "Handwriting" },
  { name: "Permanent Marker", group: "Handwriting" },
  { name: "JetBrains Mono", group: "Mono" },
];

export const FONTS = [...GOOGLE_FONTS.map((f) => f.name), ...SYSTEM_FONTS];

const loaded = new Set<string>();

/**
 * Pull one Google family in, once. Resolves when the browser has it, so a
 * caller can rasterise straight afterwards.
 */
export function loadFont(family: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (!GOOGLE_FONTS.some((f) => f.name === family)) return Promise.resolve();
  if (loaded.has(family)) return Promise.resolve();
  loaded.add(family);
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    // 400 and 700 only — the designer offers regular and bold, nothing between,
    // and every extra weight is another file over a church's wifi.
    link.href =
      "https://fonts.googleapis.com/css2?family=" +
      encodeURIComponent(family).replace(/%20/g, "+") +
      ":ital,wght@0,400;0,700;1,400;1,700&display=swap";
    link.onload = () => resolve();
    // A font that will not load must not hang the print. The canvas falls back
    // to system-ui, which is visibly wrong rather than silently missing.
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

/** Every merge field, with a description — the editor renders this list. */
export const MERGE_FIELDS: { token: string; label: string }[] = [
  { token: "{name}", label: "Full name" },
  { token: "{firstName}", label: "First name" },
  { token: "{lastName}", label: "Last name" },
  { token: "{initial}", label: "Last initial (e.g. R.)" },
  { token: "{room}", label: "Room" },
  { token: "{code}", label: "Security code" },
  { token: "{date}", label: "Check-in date" },
  { token: "{time}", label: "Check-in time" },
  { token: "{church}", label: "Church name" },
  { token: "{campus}", label: "Campus" },
  { token: "{guardian}", label: "Guardian name" },
  { token: "{service}", label: "Service" },
  { token: "{age}", label: "Age" },
  { token: "{allergy}", label: "“ALLERGY” when flagged, else blank" },
  { token: "{allergyNotes}", label: "What the allergy is (e.g. peanuts), else blank" },
];

function resolveField(token: string, v: TagValues): string {
  const when = v.checkedInAt ? new Date(v.checkedInAt) : new Date();
  const parts = (v.name ?? "").trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  switch (token) {
    case "name": return v.name ?? "";
    case "firstname": return parts[0] ?? "";
    case "lastname": return last;
    case "initial": return last ? last[0].toUpperCase() + "." : "";
    case "room": return v.room ?? "";
    case "code": return v.code ?? "";
    case "date": return when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    case "time": return when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    case "church": return v.church ?? "";
    case "campus": return v.campus ?? "";
    case "guardian": return v.guardian ?? "";
    case "service": return v.service ?? "";
    case "age": return v.age == null ? "" : String(v.age);
    case "allergy": return v.hasAllergy ? "ALLERGY" : "";
    // Gated on the flag, not just the notes: stale notes on a child whose
    // allergy was cleared must not resurrect the warning.
    case "allergynotes": return v.hasAllergy ? (v.allergyNotes ?? "").trim() : "";
    default: return "";
  }
}

/**
 * Fill merge fields.
 *
 * The replacement goes through a FUNCTION, not a string. String replacements
 * treat `$&`, `$1` and `$$` as backreferences, so a child whose name contained
 * one printed corrupted — and names are exactly the untrusted input here.
 */
export function substitute(text: string, v: TagValues): string {
  return text.replace(/\{([a-z]+)\}/gi, (whole, token: string) => {
    const key = token.toLowerCase();
    const known = MERGE_FIELDS.some((f) => f.token === `{${key}}`.toLowerCase());
    return known ? resolveField(key, v) : whole;
  });
}

/** Does this element draw, given the child in front of us? */
export function elementVisible(el: TagElement, v: TagValues, kind?: "child" | "guardian"): boolean {
  if (el.hidden) return false;
  if (el.onlyIfAllergy && !v.hasAllergy) return false;
  switch (el.showIf) {
    case "allergy": return v.hasAllergy;
    case "noAllergy": return !v.hasAllergy;
    case "hasRoom": return !!(v.room ?? "").trim();
    case "hasCode": return !!(v.code ?? "").trim();
    case "guardianOnly": return kind === "guardian";
    case "childOnly": return kind !== "guardian";
    default: return true;
  }
}

export function blankDesign(): TagDesign {
  return {
    background: "#ffffff",
    elements: [
      {
        id: newElementId(),
        kind: "text",
        name: "Church name",
        x: 0.04, y: 0.08, w: 0.92, h: 0.2,
        text: "{church}",
        fontFamily: "Poppins",
        fontSize: 8,
        bold: true,
        color: "#d2303b",
        align: "left",
      },
      {
        id: newElementId(),
        kind: "text",
        name: "Child name",
        x: 0.04, y: 0.3, w: 0.92, h: 0.38,
        text: "{name}",
        fontFamily: "Poppins",
        fontSize: 22,
        bold: true,
        color: "#0b0b0c",
        align: "left",
      },
      {
        id: newElementId(),
        kind: "text",
        name: "Room and date",
        x: 0.04, y: 0.72, w: 0.5, h: 0.2,
        text: "{room}  {date}",
        fontFamily: "system-ui",
        fontSize: 9,
        color: "#4c4d54",
        align: "left",
      },
      {
        id: newElementId(),
        kind: "text",
        name: "Security code",
        x: 0.58, y: 0.66, w: 0.38, h: 0.28,
        text: "{code}",
        fontFamily: "Courier New",
        fontSize: 16,
        bold: true,
        color: "#0b0b0c",
        align: "right",
        letterSpacing: 2,
      },
      {
        id: newElementId(),
        kind: "rect",
        name: "Allergy banner",
        x: 0.58, y: 0.08, w: 0.38, h: 0.2,
        fill: "#d2303b",
        radius: 3,
        showIf: "allergy",
      },
      {
        id: newElementId(),
        kind: "text",
        name: "Allergy text",
        x: 0.58, y: 0.09, w: 0.38, h: 0.18,
        text: "ALLERGY",
        fontFamily: "system-ui",
        fontSize: 8,
        bold: true,
        color: "#ffffff",
        align: "center",
        showIf: "allergy",
      },
    ],
  };
}

let idCounter = 0;
/**
 * Unique element id.
 *
 * blankDesign() used to hand out fixed ids (t1, t2, a1…), so duplicating a
 * template or merging two designs produced colliding ids and an edit to one
 * element silently changed another.
 */
export function newElementId(): string {
  idCounter += 1;
  return `e${Date.now().toString(36)}${idCounter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Make sure the fonts a design uses are actually loaded before we rasterise.
 *
 * Canvas silently falls back to a default face if the webfont hasn't arrived,
 * and the first badge printed after a page load is exactly when that happens.
 * There is no error, no warning — just a label in the wrong typeface.
 */
async function ensureFonts(design: TagDesign, dpi: number, heightIn: number): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const ptScale = (dpi / 72) * (heightIn / 1.125);
  const wanted = new Set<string>();
  const families = new Set<string>();
  for (const el of design.elements) {
    if (el.kind !== "text") continue;
    const size = Math.max(1, Math.round((el.fontSize ?? 12) * ptScale));
    const weight = el.bold ? "700" : "400";
    const style = el.italic ? "italic " : "";
    const family = el.fontFamily ?? "system-ui";
    families.add(family);
    wanted.add(`${style}${weight} ${size}px "${family}"`);
  }
  // Fetch any Google family this design uses before asking the browser to load
  // the face. Without this the canvas rasterises in the fallback and the print
  // quietly disagrees with the preview.
  await Promise.all([...families].map((f) => loadFont(f)));
  await Promise.all(
    [...wanted].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  await document.fonts.ready;
}

/**
 * Renders a design to a PNG data URL at the given DPI.
 * Runs in the browser (uses canvas).
 */
export async function renderTagToPng(
  tpl: { width_in: number; height_in: number; design: TagDesign; kind?: "child" | "guardian" },
  values: TagValues,
  dpi = 300,
): Promise<string> {
  const W = Math.round(tpl.width_in * dpi);
  const H = Math.round(tpl.height_in * dpi);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  await ensureFonts(tpl.design, dpi, tpl.height_in);

  ctx.fillStyle = tpl.design.background || "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (tpl.design.backgroundImage) {
    await drawImage(ctx, tpl.design.backgroundImage, 0, 0, W, H, tpl.design.backgroundFit ?? "contain");
  }

  // Font sizes are authored in pt relative to a 1.125in-tall label; scale with
  // the label so a design keeps its proportions on other label sizes.
  const ptScale = (dpi / 72) * (tpl.height_in / 1.125);
  // Everything else authored in px is authored at 96dpi.
  const pxScale = dpi / 96;

  for (const el of tpl.design.elements) {
    if (!elementVisible(el, values, tpl.kind)) continue;
    const x = el.x * W;
    const y = el.y * H;
    const w = el.w * W;
    const h = el.h * H;

    ctx.save();
    ctx.globalAlpha = el.opacity ?? 1;
    if (el.rotation) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    if (el.kind === "rect") {
      if (el.shape === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else {
        roundRect(ctx, x, y, w, h, (el.radius ?? 0) * pxScale);
      }
      if (el.fill && el.fill !== "transparent") {
        ctx.fillStyle = el.fill;
        ctx.fill();
      }
      strokeIfBordered(ctx, el, pxScale);
    } else if (el.kind === "line") {
      ctx.fillStyle = el.fill || "#000000";
      ctx.fillRect(x, y, w, Math.max(1, h));
    } else if (el.kind === "image" && el.src) {
      await drawImage(ctx, el.src, x, y, w, h, el.fit ?? "contain");
      if (el.borderWidth) {
        roundRect(ctx, x, y, w, h, (el.radius ?? 0) * pxScale);
        strokeIfBordered(ctx, el, pxScale);
      }
    } else if (el.kind === "qr" || el.kind === "barcode") {
      const payload = substitute(el.codeValue?.trim() || "{code}", values);
      if (payload) {
        const colour = el.color || "#000000";
        if (el.kind === "qr") {
          drawQr(ctx, payload, x, y, w, h, colour, el.qrEcc ?? "M");
        } else {
          const textH = el.showCodeText ? h * 0.26 : 0;
          drawCode128(ctx, payload, x, y, w, h - textH, colour);
          if (el.showCodeText) {
            const size = Math.max(6, textH * 0.82);
            ctx.fillStyle = colour;
            ctx.textBaseline = "alphabetic";
            ctx.font = `400 ${size}px "Courier New", monospace`;
            const tw = ctx.measureText(payload).width;
            ctx.fillText(payload, x + (w - tw) / 2, y + h - textH * 0.12);
          }
        }
      }
    } else if (el.kind === "text") {
      drawTextElement(ctx, el, values, x, y, w, h, ptScale, pxScale);
    }
    ctx.restore();
  }

  // Border around the whole label.
  if (tpl.design.borderWidth) {
    const bw = tpl.design.borderWidth * pxScale;
    ctx.lineWidth = bw;
    ctx.strokeStyle = tpl.design.borderColor || "#000000";
    roundRect(ctx, bw / 2, bw / 2, W - bw, H - bw, (tpl.design.borderRadius ?? 0) * pxScale);
    ctx.stroke();
  }

  // Thermal printers (DYMO) print black only. Monochrome mode thresholds the
  // image so the preview matches the physical label exactly.
  if (tpl.design.monochrome) {
    const cut = tpl.design.monochromeThreshold ?? 160;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = lum < cut ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  return canvas.toDataURL("image/png");
}

function strokeIfBordered(ctx: CanvasRenderingContext2D, el: TagElement, pxScale: number) {
  if (!el.borderWidth) return;
  const bw = el.borderWidth * pxScale;
  ctx.lineWidth = bw;
  ctx.strokeStyle = el.borderColor || "#000000";
  if (el.borderStyle === "dashed") ctx.setLineDash([bw * 3, bw * 2]);
  else if (el.borderStyle === "dotted") ctx.setLineDash([bw, bw * 1.6]);
  else ctx.setLineDash([]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function fontOf(el: TagElement, size: number) {
  const style = `${el.italic ? "italic " : ""}${el.bold ? "700 " : "400 "}`;
  return `${style}${size}px "${el.fontFamily ?? "system-ui"}", system-ui, sans-serif`;
}

function drawTextElement(
  ctx: CanvasRenderingContext2D,
  el: TagElement,
  values: TagValues,
  x: number,
  y: number,
  w: number,
  h: number,
  ptScale: number,
  pxScale: number,
) {
  let raw = substitute(el.text ?? "", values);
  if (el.uppercase) raw = raw.toUpperCase();
  if (!raw.trim()) return;

  const tracking = (el.letterSpacing ?? 0) * pxScale;
  const lineHeight = el.lineHeight ?? 1.2;
  const floor = Math.max(1, (el.minFontSize ?? 6) * ptScale);

  ctx.fillStyle = el.color || "#000000";

  // Shrink to fit. Single-line fits width only (long names must never clip);
  // wrapped text fits the whole block into the box, height included — the old
  // renderer measured width alone, so wrapped text could overflow downwards.
  let size = (el.fontSize ?? 12) * ptScale;
  let lines: string[] = [raw];
  for (;;) {
    ctx.font = fontOf(el, size);
    if (el.wrap) {
      lines = wrapText(ctx, raw, w, tracking);
      const blockH = lines.length * size * lineHeight;
      if (blockH <= h || size <= floor) break;
    } else {
      if (measure(ctx, raw, tracking) <= w || size <= floor) break;
    }
    size -= Math.max(1, size * 0.06);
  }
  ctx.font = fontOf(el, size);
  if (el.wrap) lines = wrapText(ctx, raw, w, tracking);

  const blockH = lines.length * size * lineHeight;
  let cursorY: number;
  if (el.valign === "top") cursorY = y + size * lineHeight * 0.5;
  else if (el.valign === "bottom") cursorY = y + h - blockH + size * lineHeight * 0.5;
  else cursorY = y + h / 2 - blockH / 2 + size * lineHeight * 0.5;

  ctx.textBaseline = "middle";
  for (const line of lines) {
    const textW = measure(ctx, line, tracking);
    let tx = x;
    if (el.align === "center") tx = x + (w - textW) / 2;
    else if (el.align === "right") tx = x + w - textW;
    drawTracked(ctx, line, tx, cursorY, tracking);
    cursorY += size * lineHeight;
  }
}

/** Greedy word wrap. A single word longer than the box is broken by character. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  tracking: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(ctx, candidate, tracking) <= maxWidth || !line) {
        // A word that alone exceeds the box gets split rather than clipped.
        if (!line && measure(ctx, word, tracking) > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            if (measure(ctx, chunk + ch, tracking) > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
          continue;
        }
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function measure(ctx: CanvasRenderingContext2D, s: string, tracking: number) {
  return ctx.measureText(s).width + tracking * Math.max(0, [...s].length - 1);
}

/**
 * Draw with letter-spacing.
 *
 * Tracking is applied per grapheme rather than per UTF-16 code unit, so
 * accented characters and emoji stay intact. With no tracking we hand the whole
 * string to fillText so kerning and ligatures survive.
 */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  tracking: number,
) {
  if (!tracking) return ctx.fillText(s, x, y);
  let cx = x;
  for (const ch of s) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "contain" | "cover" | "stretch" = "contain",
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (fit === "stretch") {
        ctx.drawImage(img, x, y, w, h);
      } else if (fit === "cover") {
        // Fill the box and crop the overflow, matching CSS background-size:cover.
        const s = Math.max(w / img.width, h / img.height);
        const dw = img.width * s;
        const dh = img.height * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        const s = Math.min(w / img.width, h / img.height);
        const dw = img.width * s;
        const dh = img.height * s;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}
