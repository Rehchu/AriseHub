// Generates PWA icons from the Arise flame mark. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const OUT = "public";
await mkdir(OUT, { recursive: true });

// 512-canvas SVG: ink background + centered flame+A (scaled from a 48 viewBox,
// kept within the maskable safe zone).
function svg({ bg = "#0b0b0c", pad = 96 } = {}) {
  const inner = 512 - pad * 2;
  const s = inner / 48;
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="96" fill="${bg}"/>
  <g transform="translate(${pad},${pad}) scale(${s})">
    <path d="M24 2c3 7-2 10-2 15 0 3 2 5 2 5s4-3 4-8c5 4 10 11 10 19 0 8-6.3 13-14 13S10 41 10 33c0-6 4-10 6-13 1 4 3 5 4 5-1-4 0-9 4-13 0 4 3 5 5 7 2-6-2-9-5-17Z" fill="#D2303B"/>
    <path d="M24 20l-6 16h3.4l1.2-3.6h5l1.2 3.6H32L24 20Zm-0.2 6.6l1.4 4.2h-2.8l1.4-4.2Z" fill="#fff"/>
  </g>
</svg>`;
}

const base = Buffer.from(svg());
await sharp(base).resize(192, 192).png().toFile(`${OUT}/icon-192.png`);
await sharp(base).resize(512, 512).png().toFile(`${OUT}/icon-512.png`);
await sharp(base).resize(180, 180).png().toFile(`${OUT}/apple-touch-icon.png`);
await sharp(Buffer.from(svg({ pad: 40 }))).resize(64, 64).png().toFile(`${OUT}/favicon-64.png`);
console.log("icons written to /public");
