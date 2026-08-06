// One-off icon generator for the PWA manifest. Run with: node scripts/generate-icons.mjs
// Renders the Arise IT flame+A mark (brand red flame, white A) on a near-black
// tile — matching the app's dark chrome and the sidebar/login logo.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(outDir, { recursive: true });

const BRAND_RED = "#d2303b";
const INK = "#0b0b0c";

// Keep these paths in sync with frontend/src/components/Logo.tsx (0..100 viewBox).
const FLAME_PATH =
  "M50 4 C 58 22 74 30 68 50 C 65 59 58 61 55 56 C 60 69 53 77 55 87 C 71 82 83 66 78 46 C 90 61 90 82 67 92 C 61 94 56 95 50 95 C 33 95 20 81 24 63 C 26 52 35 47 39 51 C 33 38 40 21 50 4 Z";
const A_OUTLINE = "M50 40 L64 80 L36 80 Z M50 56 L58 77 L42 77 Z";
const A_CROSSBAR = "M43 69 L57 69 L59 75 L41 75 Z";

function iconSvg(size, { maskableSafeZone = false, transparent = false } = {}) {
  const frac = maskableSafeZone ? 0.6 : 0.72;
  const content = size * frac;
  const scale = content / 100;
  const offset = (size - content) / 2;
  const radius = Math.round(size * 0.22);
  const bg = transparent
    ? ""
    : `<rect width="${size}" height="${size}" rx="${radius}" fill="${INK}" />`;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${bg}
      <g transform="translate(${offset} ${offset}) scale(${scale})">
        <path d="${FLAME_PATH}" fill="${BRAND_RED}" />
        <path d="${A_OUTLINE}" fill="#ffffff" fill-rule="evenodd" />
        <path d="${A_CROSSBAR}" fill="#ffffff" />
      </g>
    </svg>`;
}

async function render(name, size, opts) {
  await sharp(Buffer.from(iconSvg(size, opts))).png().toFile(path.join(outDir, name));
  console.log(`Wrote ${name}`);
}

await render("icon-192.png", 192);
await render("icon-512.png", 512);
await render("icon-maskable-512.png", 512, { maskableSafeZone: true });
await render("apple-touch-icon.png", 180);
await render("favicon.png", 32, { transparent: true });
// Master SVG (transparent) reused by the app + PDF posters.
import { writeFileSync } from "node:fs";
writeFileSync(path.join(outDir, "logo.svg"), iconSvg(100, { transparent: true }).trim());
console.log("Wrote logo.svg");

console.log("Done. Icons written to frontend/public/.");
