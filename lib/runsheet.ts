import { printHtmlInFrame } from "./print-frame";

// A printable run sheet for a service plan.
//
// Sunday morning still runs on paper: the sound desk, the stage and the green
// room each want the order in their hand, not on a phone that sleeps. This
// renders exactly what the plan page shows — the running clock, the items, who
// is on — in a layout meant for A4 rather than a screenshot of the app.

export interface RunSheetItem {
  sort_order: number;
  title: string;
  item_type: string;
  duration_minutes: number | null;
  notes: string | null;
  song_key: string | null;
}

export interface RunSheetAssignment {
  position: string;
  status: "invited" | "accepted" | "declined";
  assignee: { full_name: string } | null;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Elapsed minutes → running-clock label, matching the on-screen plan. */
const clockAt = (min: number) =>
  Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0");

export function printRunSheet({
  title,
  serviceDate,
  notes,
  items,
  assignments,
}: {
  title: string;
  serviceDate: string;
  notes: string | null;
  items: RunSheetItem[];
  assignments: RunSheetAssignment[];
}) {
  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order);

  let acc = 0;
  const rows = ordered
    .map((i) => {
      const start = acc;
      acc += i.duration_minutes ?? 0;
      return `
      <tr>
        <td class="clock">${clockAt(start)}</td>
        <td class="len">${i.duration_minutes ? `${i.duration_minutes}m` : "—"}</td>
        <td>
          <span class="title">${esc(i.title)}</span>
          ${i.song_key ? `<span class="key">${esc(i.song_key)}</span>` : ""}
          <span class="type">${esc(i.item_type)}</span>
          ${i.notes ? `<div class="notes">${esc(i.notes)}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  // Declines are left off: the sheet is who IS serving. A declined slot reads
  // as unfilled, which is the truth on the day.
  const team = assignments
    .filter((a) => a.status !== "declined")
    .map(
      (a) => `
      <li>
        <span class="pos">${esc(a.position)}</span>
        <span class="who">${esc(a.assignee?.full_name ?? "—")}</span>
        ${a.status === "invited" ? '<span class="pending">not confirmed</span>' : ""}
      </li>`,
    )
    .join("");

  const dateLabel = new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  printHtmlInFrame(`<!doctype html><html><head><title>${esc(title)} — run sheet</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; }
  h1 { margin: 0 0 2px; font-size: 20pt; }
  .date { margin: 0 0 2px; color: #444; font-size: 11pt; }
  .total { color: #666; font-size: 10pt; }
  .plan-notes { margin: 8px 0 0; padding: 6px 8px; background: #f4f4f5; border-radius: 4px; font-size: 10pt; }
  h2 { margin: 16px 0 6px; font-size: 12pt; text-transform: uppercase; letter-spacing: .05em; color: #666; }
  table { width: 100%; border-collapse: collapse; }
  td { border-bottom: 1px solid #e5e5e5; padding: 5px 4px; vertical-align: top; font-size: 10.5pt; }
  .clock { width: 52px; font-variant-numeric: tabular-nums; font-weight: 700; }
  .len { width: 42px; color: #666; font-variant-numeric: tabular-nums; }
  .title { font-weight: 600; }
  .key { margin-left: 6px; padding: 0 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 8.5pt; }
  .type { margin-left: 6px; color: #888; font-size: 8.5pt; text-transform: uppercase; }
  .notes { margin-top: 2px; color: #444; font-size: 9.5pt; }
  ul { margin: 0; padding: 0; list-style: none; columns: 2; }
  li { break-inside: avoid; padding: 3px 0; font-size: 10.5pt; }
  .pos { display: inline-block; min-width: 120px; color: #666; }
  .who { font-weight: 600; }
  .pending { margin-left: 5px; color: #b45309; font-size: 8.5pt; }
  /* A run sheet that splits a row across pages is useless at the desk. */
  tr, li { page-break-inside: avoid; }
</style></head><body>
  <h1>${esc(title)}</h1>
  <p class="date">${dateLabel}</p>
  <p class="total">${ordered.length} items · ${acc} minutes planned</p>
  ${notes ? `<p class="plan-notes">${esc(notes)}</p>` : ""}
  <h2>Order of service</h2>
  <table>${rows || '<tr><td colspan="3">No items yet.</td></tr>'}</table>
  <h2>Team</h2>
  <ul>${team || "<li>Nobody scheduled.</li>"}</ul>
</body></html>`);
}
