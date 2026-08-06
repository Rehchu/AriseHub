// Name-tag design model + renderer.
//
// A template is a small scene graph. The station renders it to a PNG at print
// DPI, then sends that image to the DYMO (as an ImageObject) or to the browser
// print dialog. Rendering to an image means WYSIWYG — whatever the designer
// shows is exactly what prints, on any printer.

export type ElementKind = "text" | "rect" | "image" | "line";

export interface TagElement {
  id: string;
  kind: ElementKind;
  // Position/size as a FRACTION of the label (0–1), so a design survives being
  // moved to a different label size.
  x: number;
  y: number;
  w: number;
  h: number;
  // text
  text?: string; // supports {name} {room} {code} {date} {allergy} {church}
  fontFamily?: string;
  fontSize?: number; // pt at 1x label height
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  // rect / line
  fill?: string;
  radius?: number;
  // image
  src?: string; // data URL
  // shared
  rotation?: number;
  opacity?: number;
  // Hide this element unless the child has an allergy (for warning banners).
  onlyIfAllergy?: boolean;
}

export interface TagDesign {
  background: string;
  backgroundImage?: string; // data URL
  elements: TagElement[];
}

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
}

export const FONTS = [
  "Poppins",
  "system-ui",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Comic Sans MS",
  "Trebuchet MS",
  "Verdana",
];

export function substitute(text: string, v: TagValues): string {
  const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return text
    .replace(/\{name\}/gi, v.name)
    .replace(/\{room\}/gi, v.room)
    .replace(/\{code\}/gi, v.code)
    .replace(/\{date\}/gi, date)
    .replace(/\{church\}/gi, v.church)
    .replace(/\{allergy\}/gi, v.hasAllergy ? "ALLERGY" : "");
}

export function blankDesign(): TagDesign {
  return {
    background: "#ffffff",
    elements: [
      {
        id: "t1",
        kind: "text",
        x: 0.04,
        y: 0.08,
        w: 0.92,
        h: 0.2,
        text: "{church}",
        fontFamily: "Poppins",
        fontSize: 8,
        bold: true,
        color: "#d2303b",
        align: "left",
      },
      {
        id: "t2",
        kind: "text",
        x: 0.04,
        y: 0.3,
        w: 0.92,
        h: 0.38,
        text: "{name}",
        fontFamily: "Poppins",
        fontSize: 22,
        bold: true,
        color: "#0b0b0c",
        align: "left",
      },
      {
        id: "t3",
        kind: "text",
        x: 0.04,
        y: 0.72,
        w: 0.5,
        h: 0.2,
        text: "{room}  {date}",
        fontFamily: "system-ui",
        fontSize: 9,
        color: "#4c4d54",
        align: "left",
      },
      {
        id: "t4",
        kind: "text",
        x: 0.58,
        y: 0.66,
        w: 0.38,
        h: 0.28,
        text: "{code}",
        fontFamily: "Courier New",
        fontSize: 16,
        bold: true,
        color: "#0b0b0c",
        align: "right",
        letterSpacing: 2,
      },
      {
        id: "a1",
        kind: "rect",
        x: 0.58,
        y: 0.08,
        w: 0.38,
        h: 0.2,
        fill: "#d2303b",
        radius: 3,
        onlyIfAllergy: true,
      },
      {
        id: "a2",
        kind: "text",
        x: 0.58,
        y: 0.09,
        w: 0.38,
        h: 0.18,
        text: "ALLERGY",
        fontFamily: "system-ui",
        fontSize: 8,
        bold: true,
        color: "#ffffff",
        align: "center",
        onlyIfAllergy: true,
      },
    ],
  };
}

/**
 * Renders a design to a PNG data URL at the given DPI.
 * Runs in the browser (uses canvas).
 */
export async function renderTagToPng(
  tpl: { width_in: number; height_in: number; design: TagDesign },
  values: TagValues,
  dpi = 300,
): Promise<string> {
  const W = Math.round(tpl.width_in * dpi);
  const H = Math.round(tpl.height_in * dpi);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = tpl.design.background || "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (tpl.design.backgroundImage) {
    await drawImage(ctx, tpl.design.backgroundImage, 0, 0, W, H);
  }

  // Font sizes are authored in pt relative to a 1.125in-tall label; scale with
  // the label so a design keeps its proportions on other label sizes.
  const ptScale = (dpi / 72) * (tpl.height_in / 1.125);

  for (const el of tpl.design.elements) {
    if (el.onlyIfAllergy && !values.hasAllergy) continue;
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
      ctx.fillStyle = el.fill || "#000000";
      roundRect(ctx, x, y, w, h, (el.radius ?? 0) * (dpi / 96));
      ctx.fill();
    } else if (el.kind === "line") {
      ctx.fillStyle = el.fill || "#000000";
      ctx.fillRect(x, y, w, Math.max(1, h));
    } else if (el.kind === "image" && el.src) {
      await drawImage(ctx, el.src, x, y, w, h);
    } else if (el.kind === "text") {
      const raw = substitute(el.text ?? "", values);
      if (raw.trim()) {
        const size = (el.fontSize ?? 12) * ptScale;
        ctx.fillStyle = el.color || "#000000";
        ctx.textBaseline = "middle";
        const style = `${el.italic ? "italic " : ""}${el.bold ? "700 " : "400 "}`;
        ctx.font = `${style}${size}px "${el.fontFamily ?? "system-ui"}", system-ui, sans-serif`;

        // Shrink to fit the element's width — long names must never clip.
        let fitted = size;
        while (measure(ctx, raw, el.letterSpacing ?? 0) > w && fitted > 6) {
          fitted -= Math.max(1, fitted * 0.06);
          ctx.font = `${style}${fitted}px "${el.fontFamily ?? "system-ui"}", system-ui, sans-serif`;
        }

        const textW = measure(ctx, raw, el.letterSpacing ?? 0);
        let tx = x;
        if (el.align === "center") tx = x + (w - textW) / 2;
        else if (el.align === "right") tx = x + w - textW;
        drawTracked(ctx, raw, tx, y + h / 2, el.letterSpacing ?? 0);
      }
    }
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

function measure(ctx: CanvasRenderingContext2D, s: string, tracking: number) {
  return ctx.measureText(s).width + tracking * Math.max(0, s.length - 1);
}
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
  const rr = Math.min(r, w / 2, h / 2);
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
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // contain, centered
      const s = Math.min(w / img.width, h / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}
