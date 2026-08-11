import { printHtmlInFrame } from "./print-frame";

// Name-tag printing for check-in.
//
// The church prints on a DYMO LabelWriter using 30252 Address labels
// (3.5" x 1.125"). Browsers can't drive the DYMO SDK — and iPads can't talk to
// it at all — but the DYMO installs as a normal system printer, so a print
// window with an exact @page size prints correctly from any desktop browser.
// Pick the DYMO in the print dialog and set scale to 100%.

export interface NameTagOptions {
  showChurchName: boolean;
  churchName: string;
  showRoom: boolean;
  showCode: boolean;
  showDate: boolean;
  showAllergy: boolean;
  showGuardianTag: boolean; // second label for the guardian's claim tag
  fontScale: number; // 0.8 – 1.4
  /**
   * Whether THIS device prints. On for the one computer wired to the DYMO; off
   * for check-in tablets (iPad or Android) that only check kids in — they'd
   * otherwise pop a useless print dialog. Per device (localStorage), so the
   * printer station and the tablets each remember their own answer.
   */
  printHere: boolean;
  /**
   * When on, this device polls every few seconds for check-ins that have no
   * badge yet (from self-service tablets) and prints them — once each. Only
   * meaningful on the printer station (printHere). Off by default; you turn it
   * on at the one computer by the DYMO.
   */
  autoPrint: boolean;
}

export const DEFAULT_TAG_OPTIONS: NameTagOptions = {
  showChurchName: true,
  churchName: "Arise Church",
  showRoom: true,
  showCode: true,
  showDate: true,
  showAllergy: true,
  showGuardianTag: true,
  fontScale: 1,
  printHere: true,
  autoPrint: false,
};

export interface NameTagData {
  name: string;
  room: string;
  code: string;
  hasAllergy: boolean;
  /** What the allergy is ("peanuts") — printed beside the flag when known. */
  allergyNotes?: string;
  /**
   * When the check-in actually happened. Reprinting a badge on Monday must not
   * stamp it with Monday's date — the date on a child's tag is evidence.
   */
  checkedInAt?: string;
  campus?: string;
  guardian?: string;
  service?: string;
  age?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function labelHtml(d: NameTagData, o: NameTagOptions, variant: "child" | "guardian") {
  const f = (n: number) => (n * o.fontScale).toFixed(2);
  const today = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `
  <div class="label">
    ${o.showChurchName ? `<div class="church" style="font-size:${f(7)}pt">${esc(o.churchName)}${variant === "guardian" ? " · PICKUP" : ""}</div>` : ""}
    <div class="name" style="font-size:${f(variant === "guardian" ? 15 : 20)}pt">${esc(d.name)}</div>
    <div class="meta" style="font-size:${f(8)}pt">
      ${o.showRoom && d.room ? `<span>${esc(d.room)}</span>` : ""}
      ${o.showDate ? `<span>${today}</span>` : ""}
      ${o.showAllergy && d.hasAllergy ? `<span class="allergy">ALLERGY${d.allergyNotes ? `: ${esc(d.allergyNotes)}` : ""}</span>` : ""}
    </div>
    ${o.showCode ? `<div class="code" style="font-size:${f(variant === "guardian" ? 22 : 14)}pt">${esc(d.code)}</div>` : ""}
  </div>`;
}

/** Opens a print window containing the child tag (+ optional guardian tag). */
export function printNameTag(d: NameTagData, o: NameTagOptions) {
  const labels =
    labelHtml(d, o, "child") + (o.showGuardianTag ? labelHtml(d, o, "guardian") : "");

  printHtmlInFrame(`<!doctype html><html><head><title>Name tag — ${esc(d.name)}</title>
<style>
  /* DYMO 30252 Address label: 3.5in x 1.125in, printed landscape. */
  @page { size: 3.5in 1.125in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .label {
    width: 3.5in; height: 1.125in;
    padding: 0.06in 0.12in;
    display: flex; flex-direction: column; justify-content: center;
    page-break-after: always; break-after: page;
    overflow: hidden;
  }
  .church { text-transform: uppercase; letter-spacing: .06em; color: #d2303b; font-weight: 700; line-height: 1.1; }
  .name { font-weight: 800; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: .16in; color: #333; line-height: 1.2; }
  .allergy { background: #d2303b; color: #fff; padding: 0 .05in; border-radius: .03in; font-weight: 800; }
  .code { font-family: ui-monospace, "Courier New", monospace; font-weight: 800; letter-spacing: .14em; }
  @media screen { body { background:#eee; padding: 12px; } .label { background:#fff; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
</style></head><body>${labels}
</body></html>`);
}
