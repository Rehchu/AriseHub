// Built-in clip art for the name tag studio.
//
// Each item is an inline SVG rendered to a data URL on demand, so art is
// resolution-independent, prints crisply, adds no network requests, and is
// recolourable. Anything the church uploads (logos, photos) sits alongside
// these as ordinary image elements.

export interface ClipArt {
  id: string;
  label: string;
  category: "faith" | "kids" | "shapes" | "decor" | "signs";
  /** SVG body drawn in a 0 0 100 100 viewBox. `CURRENT` is swapped for the colour. */
  body: string;
}

export const CLIPART: ClipArt[] = [
  // --- Faith ---
  {
    id: "cross",
    label: "Cross",
    category: "faith",
    body: '<rect x="42" y="8" width="16" height="84" fill="CURRENT"/><rect x="18" y="32" width="64" height="16" fill="CURRENT"/>',
  },
  {
    id: "dove",
    label: "Dove",
    category: "faith",
    body: '<path d="M12 62c18 6 34 2 46-10 8-8 12-18 10-28 10 6 16 14 18 24 8-4 12-10 12-18 6 14 2 30-10 42-14 14-36 20-58 14-8-2-14-6-18-12z" fill="CURRENT"/>',
  },
  {
    id: "flame",
    label: "Flame",
    category: "faith",
    body: '<path d="M50 6c6 14-4 20-4 30 0 6 4 10 4 10s8-6 8-16c10 8 20 22 20 38 0 16-13 26-28 26s-28-10-28-26c0-12 8-20 12-26 2 8 6 10 8 10-2-8 0-18 8-26 0 8 6 10 10 14 4-12-4-18-10-34z" fill="CURRENT"/>',
  },
  {
    id: "bible",
    label: "Bible",
    category: "faith",
    body: '<rect x="18" y="18" width="64" height="64" rx="4" fill="CURRENT"/><rect x="46" y="30" width="8" height="40" fill="#fff"/><rect x="34" y="46" width="32" height="8" fill="#fff"/>',
  },
  {
    id: "heart",
    label: "Heart",
    category: "faith",
    body: '<path d="M50 84S14 62 14 38c0-12 9-20 20-20 8 0 14 4 16 10 2-6 8-10 16-10 11 0 20 8 20 20 0 24-36 46-36 46z" fill="CURRENT"/>',
  },
  // --- Kids ---
  {
    id: "star",
    label: "Star",
    category: "kids",
    body: '<path d="M50 8l12 26 28 4-20 20 5 28-25-13-25 13 5-28-20-20 28-4z" fill="CURRENT"/>',
  },
  {
    id: "balloon",
    label: "Balloon",
    category: "kids",
    body: '<ellipse cx="50" cy="38" rx="26" ry="32" fill="CURRENT"/><path d="M50 70l-6 10h12z" fill="CURRENT"/><path d="M50 80c0 8 8 8 8 16" stroke="CURRENT" stroke-width="4" fill="none"/>',
  },
  {
    id: "smile",
    label: "Smiley",
    category: "kids",
    body: '<circle cx="50" cy="50" r="38" fill="CURRENT"/><circle cx="37" cy="42" r="5" fill="#fff"/><circle cx="63" cy="42" r="5" fill="#fff"/><path d="M32 60c6 10 30 10 36 0" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>',
  },
  {
    id: "rainbow",
    label: "Rainbow",
    category: "kids",
    body: '<path d="M12 78a38 38 0 0176 0" stroke="CURRENT" stroke-width="10" fill="none"/><path d="M26 78a24 24 0 0148 0" stroke="CURRENT" stroke-width="10" fill="none" opacity=".6"/>',
  },
  {
    id: "crown",
    label: "Crown",
    category: "kids",
    body: '<path d="M14 74V34l18 14 18-24 18 24 18-14v40z" fill="CURRENT"/>',
  },
  {
    id: "paw",
    label: "Paw",
    category: "kids",
    body: '<ellipse cx="50" cy="66" rx="22" ry="18" fill="CURRENT"/><circle cx="26" cy="42" r="10" fill="CURRENT"/><circle cx="42" cy="30" r="10" fill="CURRENT"/><circle cx="58" cy="30" r="10" fill="CURRENT"/><circle cx="74" cy="42" r="10" fill="CURRENT"/>',
  },
  // --- Shapes ---
  { id: "circle", label: "Circle", category: "shapes", body: '<circle cx="50" cy="50" r="40" fill="CURRENT"/>' },
  { id: "square", label: "Square", category: "shapes", body: '<rect x="12" y="12" width="76" height="76" fill="CURRENT"/>' },
  { id: "triangle", label: "Triangle", category: "shapes", body: '<path d="M50 10l40 76H10z" fill="CURRENT"/>' },
  { id: "hex", label: "Hexagon", category: "shapes", body: '<path d="M50 8l36 21v42L50 92 14 71V29z" fill="CURRENT"/>' },
  { id: "badge", label: "Badge", category: "shapes", body: '<path d="M50 6l12 8h14l4 14 10 10-6 14 4 14-14 6-6 14-14-4-14 8-10-12-14-4 2-14-8-12 10-12V22l14-6z" fill="CURRENT"/>' },
  { id: "speech", label: "Speech bubble", category: "shapes", body: '<rect x="10" y="16" width="80" height="52" rx="10" fill="CURRENT"/><path d="M30 68l-4 20 24-20z" fill="CURRENT"/>' },
  // --- Decor ---
  {
    id: "confetti",
    label: "Confetti",
    category: "decor",
    body: '<rect x="14" y="18" width="10" height="6" rx="2" fill="CURRENT" transform="rotate(-20 19 21)"/><rect x="46" y="10" width="10" height="6" rx="2" fill="CURRENT" transform="rotate(25 51 13)"/><rect x="76" y="24" width="10" height="6" rx="2" fill="CURRENT" transform="rotate(-40 81 27)"/><rect x="24" y="60" width="10" height="6" rx="2" fill="CURRENT" transform="rotate(35 29 63)"/><rect x="62" y="66" width="10" height="6" rx="2" fill="CURRENT" transform="rotate(-15 67 69)"/>',
  },
  {
    id: "sparkle",
    label: "Sparkle",
    category: "decor",
    body: '<path d="M50 10l8 26 26 8-26 8-8 26-8-26-26-8 26-8z" fill="CURRENT"/>',
  },
  {
    id: "wave",
    label: "Wave",
    category: "decor",
    body: '<path d="M4 60c12-16 24-16 36 0s24 16 36 0 12-8 20-4" stroke="CURRENT" stroke-width="8" fill="none" stroke-linecap="round"/>',
  },
  {
    id: "ribbon",
    label: "Ribbon",
    category: "decor",
    body: '<rect x="8" y="38" width="84" height="24" fill="CURRENT"/><path d="M8 38L0 50l8 12zM92 38l8 12-8 12z" fill="CURRENT" opacity=".7"/>',
  },
  // --- Signs ---
  {
    id: "alert",
    label: "Allergy alert",
    category: "signs",
    body: '<path d="M50 8l44 78H6z" fill="CURRENT"/><rect x="45" y="36" width="10" height="26" rx="4" fill="#fff"/><circle cx="50" cy="72" r="6" fill="#fff"/>',
  },
  {
    id: "check",
    label: "Check",
    category: "signs",
    body: '<path d="M16 52l22 22 46-48" stroke="CURRENT" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "shield",
    label: "Shield",
    category: "signs",
    body: '<path d="M50 8l34 12v28c0 22-14 36-34 44-20-8-34-22-34-44V20z" fill="CURRENT"/>',
  },
  {
    id: "pin",
    label: "Location pin",
    category: "signs",
    body: '<path d="M50 8c-16 0-28 12-28 28 0 20 28 56 28 56s28-36 28-56c0-16-12-28-28-28z" fill="CURRENT"/><circle cx="50" cy="36" r="10" fill="#fff"/>',
  },
];

export const CLIPART_CATEGORIES: { key: ClipArt["category"]; label: string }[] = [
  { key: "faith", label: "Faith" },
  { key: "kids", label: "Kids" },
  { key: "shapes", label: "Shapes" },
  { key: "decor", label: "Decor" },
  { key: "signs", label: "Signs" },
];

/** Render a clip art item to an SVG data URL in the given colour. */
export function clipArtDataUrl(art: ClipArt, color = "#d2303b"): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    art.body.replace(/CURRENT/g, color) +
    `</svg>`;
  // encodeURIComponent keeps it safe inside a data: URL (and canvas-loadable).
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
