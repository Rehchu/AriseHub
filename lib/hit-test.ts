/**
 * Is this point on the ink, or on empty space?
 *
 * A clip-art sparkle is mostly transparent, but its BOX is fully clickable — so
 * a sparkle laid over {name} swallowed every click meant for the text
 * underneath, and the layers list was the only way to reach it. Measured on a
 * real board: 3 of 8 elements could not be selected at all.
 *
 * So for images we ask the pixels rather than the rectangle. Everything else
 * (text, boxes, lines, codes) is treated as solid, because it is.
 */

/** One decoded copy per image source. Sampling happens many times per drag. */
const alphaCache = new Map<string, ImageData | null>();
/** Sources that failed to decode or tainted the canvas — never retried. */
const unsampleable = new Set<string>();

/** Cap the decode. A 4000px logo does not need 4000px of alpha data. */
const SAMPLE_MAX = 256;

function sample(src: string, img: HTMLImageElement): ImageData | null {
  if (alphaCache.has(src)) return alphaCache.get(src)!;
  if (unsampleable.has(src)) return null;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return null; // not decoded yet — treat as solid for now
  try {
    const scale = Math.min(1, SAMPLE_MAX / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(img, 0, 0, w, h);
    // Throws a SecurityError if the image tainted the canvas. Clip art is an
    // inline data URL and uploads come through our own origin, so this should
    // not happen — but a tainted canvas must degrade to "solid", never crash a
    // check-in desk mid-drag.
    const data = cx.getImageData(0, 0, w, h);
    alphaCache.set(src, data);
    return data;
  } catch {
    unsampleable.add(src);
    return null;
  }
}

/**
 * Map a point inside the element's box onto the image's own pixels, honouring
 * object-fit. `contain` letterboxes, `cover` crops, `fill` stretches — get this
 * wrong and the sampled pixel is not the one under the cursor.
 *
 * u/v are 0..1 within the element box. Returns null when the point lands in the
 * letterbox, which IS empty space and should not count as a hit.
 */
function toImagePoint(
  u: number,
  v: number,
  /** The box's aspect ratio in REAL pixels, not in label fractions. */
  boxAspect: number,
  natW: number,
  natH: number,
  fit: "contain" | "cover" | "stretch",
): { u: number; v: number } | null {
  if (fit === "stretch") return { u, v };
  const imgAspect = natW / natH;
  // How much of the box the drawn image actually occupies, per axis.
  let drawnW = 1;
  let drawnH = 1;
  if (fit === "contain") {
    if (imgAspect > boxAspect) drawnH = boxAspect / imgAspect;
    else drawnW = imgAspect / boxAspect;
  } else {
    // cover: the image overflows on one axis and is cropped.
    if (imgAspect > boxAspect) drawnW = imgAspect / boxAspect;
    else drawnH = boxAspect / imgAspect;
  }
  const offU = (1 - drawnW) / 2;
  const offV = (1 - drawnH) / 2;
  const iu = (u - offU) / drawnW;
  const iv = (v - offV) / drawnH;
  if (iu < 0 || iu > 1 || iv < 0 || iv > 1) return null; // letterbox
  return { u: iu, v: iv };
}

export interface HitTestElement {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  fit?: string;
}

/**
 * Does a point (as a fraction of the label) land on this element's ink?
 *
 * `stage` is the element that holds the design, used to find the rendered <img>
 * by data-el-id. Anything we cannot sample is treated as solid — failing toward
 * the old behaviour is right, because a click that selects the wrong thing is
 * recoverable and one that selects nothing feels broken.
 */
export function hitsElement(
  el: HitTestElement,
  fx: number,
  fy: number,
  stage: HTMLElement | null,
  alphaThreshold = 12,
): boolean {
  const left = Math.min(el.x, el.x + el.w);
  const top = Math.min(el.y, el.y + el.h);
  const w = Math.abs(el.w);
  const h = Math.abs(el.h);
  if (w === 0 || h === 0) return false;

  // Rotation is applied about the element's centre, so undo it before asking
  // where the point sits inside the unrotated box.
  let px = fx;
  let py = fy;
  if (el.rotation) {
    const cx = left + w / 2;
    const cy = top + h / 2;
    const rad = (-el.rotation * Math.PI) / 180;
    // The label is not square, so rotate in a square space or the angle skews.
    const stageAspect = stage ? stage.clientWidth / Math.max(1, stage.clientHeight) : 1;
    const dx = (fx - cx) * stageAspect;
    const dy = fy - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    px = cx + rx / stageAspect;
    py = cy + ry;
  }

  const u = (px - left) / w;
  const v = (py - top) / h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;

  // Only images have holes worth respecting.
  if (el.kind !== "image") return true;
  if (!stage) return true;

  const img = stage.querySelector<HTMLImageElement>(`[data-el-id="${el.id}"] img`);
  if (!img || !img.src) return true;

  const data = sample(img.src, img);
  if (!data) return true;

  const fit = el.fit === "cover" ? "cover" : el.fit === "stretch" ? "stretch" : "contain";
  // In PIXELS. w and h are fractions of the label, and the label is far wider
  // than it is tall — a 0.8 x 0.6 box is not 1.33:1, it is about 4:1 on a
  // 3.5in x 1.125in tag. Using the fractions made object-fit sample the wrong
  // pixel, which the geometry unit tests could not catch because they never
  // touch an image.
  const boxAspect =
    (w * stage.clientWidth) / Math.max(1, h * stage.clientHeight);
  const p = toImagePoint(u, v, boxAspect, img.naturalWidth, img.naturalHeight, fit);
  if (!p) return false; // in the letterbox, i.e. genuinely empty

  const ix = Math.min(data.width - 1, Math.max(0, Math.round(p.u * (data.width - 1))));
  const iy = Math.min(data.height - 1, Math.max(0, Math.round(p.v * (data.height - 1))));
  const alpha = data.data[(iy * data.width + ix) * 4 + 3];
  return alpha >= alphaThreshold;
}
