/**
 * Printable presenter script for the leadership deck.
 *
 * Run: node tools/build-notes-script.mjs
 * Out: AriseHub-Leadership-Script.pptx (convert to PDF to hand around)
 *
 * PowerPoint's own "Notes Pages" export could not be driven reliably through
 * automation here — it silently re-exported the slides instead — so the script
 * is built directly. That also makes it better for the job: light background,
 * large type, and no shrunken slide thumbnail eating the page.
 *
 * The notes themselves live in deck-notes.mjs, shared with the deck, so the two
 * can never drift apart.
 */
import PptxGenJS from "pptxgenjs";
import path from "node:path";
import { NOTES } from "./deck-notes.mjs";

// Light, printable — the opposite of the deck. Nobody wants to print a
// near-black page, and this is read under house lights or on paper.
const PAPER = "FFFFFF";
const INK = "111114";
const BODY = "2B2C33";
const RED = "C42A36";
const RULE = "E3E3E6";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
pptx.layout = "W";
pptx.author = "Arise Church";
pptx.title = "AriseHub — Presenter script";

// Cover.
{
  const s = pptx.addSlide();
  s.background = { color: PAPER };
  s.addText("Presenter script", {
    x: 0.8, y: 2.6, w: 11.7, h: 0.9, fontSize: 40, bold: true, color: INK, fontFace: "Arial",
  });
  s.addText("AriseHub — Leadership Presentation", {
    x: 0.85, y: 3.5, w: 11.7, h: 0.5, fontSize: 20, color: BODY, fontFace: "Arial",
  });
  s.addText(
    "One page per slide, in order. These are what to say — the slides carry the headlines, " +
      "so you should never need to read them aloud. Skip anything that doesn't fit the room.",
    { x: 0.85, y: 4.15, w: 10.5, h: 1, fontSize: 14, color: BODY, lineSpacingMultiple: 1.3, fontFace: "Arial" },
  );
}

let page = 0;
for (const [title, text] of Object.entries(NOTES)) {
  page++;
  const s = pptx.addSlide();
  s.background = { color: PAPER };

  s.addText(`SLIDE — ${title.toUpperCase()}`, {
    x: 0.8, y: 0.55, w: 11.7, h: 0.4, fontSize: 13, bold: true, color: RED,
    charSpacing: 1.5, fontFace: "Arial", fit: "shrink",
  });
  s.addShape(pptx.ShapeType.rect, { x: 0.82, y: 1.02, w: 11.65, h: 0.03, fill: { color: RULE } });

  // Blank lines in the source become paragraph breaks, so the script reads as
  // separate beats rather than a wall of text.
  const paras = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => ({
      text: p.replace(/\s*\n\s*/g, " ").trim(),
      options: {
        fontSize: 17,
        color: BODY,
        lineSpacingMultiple: 1.35,
        paraSpaceAfter: 14,
        breakLine: true,
      },
    }));
  s.addText(paras, {
    x: 0.85, y: 1.35, w: 11.6, h: 5.4, valign: "top", fontFace: "Arial", fit: "shrink",
  });

  s.addText(`${page}`, {
    x: 11.8, y: 6.85, w: 0.7, h: 0.3, fontSize: 11, color: "9A9BA1", align: "right", fontFace: "Arial",
  });
}

const out = path.join(process.cwd(), "AriseHub-Leadership-Script.pptx");
await pptx.writeFile({ fileName: out });
console.log(`Wrote ${out} — ${page} script pages (+ cover)`);
