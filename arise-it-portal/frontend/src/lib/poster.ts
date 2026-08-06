import { jsPDF } from "jspdf";
import QRCode from "qrcode";

// Served from frontend/public at the site root.
const iconUrl = "/icon-192.png";

// Client-side PDF generators for print-ready posters and label sheets.
// All Arise-branded; no network calls beyond loading the bundled logo.

const BRAND_RED: [number, number, number] = [210, 48, 59];
const INK: [number, number, number] = [11, 11, 12];

async function loadDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 800, errorCorrectionLevel: "M" });
}

// Red header band with the flame logo + "ARISE IT" wordmark. Returns the y
// coordinate just below the band.
function drawHeader(doc: jsPDF, logo: string, pageW: number): number {
  doc.setFillColor(...INK);
  doc.rect(0, 0, pageW, 26, "F");
  doc.addImage(logo, "PNG", 12, 5, 16, 16);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("ARISE", 32, 13);
  doc.setTextColor(...BRAND_RED);
  doc.text("IT", 55, 13);
  doc.setTextColor(200, 200, 205);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("PORTAL", 32, 19);
  return 26;
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number) {
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Arise Church IT · Pineville, LA", pageW / 2, pageH - 12, { align: "center" });
}

export async function generateAccessPoster(opts: {
  label: string;
  code: string;
  scope: "equipment" | "wifi";
  campusName: string;
  baseUrl: string;
}) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cx = pageW / 2;
  const logo = await loadDataUrl(iconUrl);
  const url = `${opts.baseUrl}/go`;
  const qr = await qrDataUrl(url);

  drawHeader(doc, logo, pageW);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(opts.label, cx, 46, { align: "center", maxWidth: pageW - 30 });

  doc.setTextColor(...BRAND_RED);
  doc.setFontSize(13);
  doc.text("Quick Access — no account needed", cx, 55, { align: "center" });

  const qrSize = 78;
  doc.addImage(qr, "PNG", cx - qrSize / 2, 62, qrSize, qrSize);

  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Scan the code, or go to  ${url}`, cx, 150, { align: "center" });

  // The access code, large and monospace.
  doc.setDrawColor(...BRAND_RED);
  doc.setLineWidth(0.8);
  doc.roundedRect(cx - 55, 158, 110, 20, 3, 3, "S");
  doc.setTextColor(...INK);
  doc.setFont("courier", "bold");
  doc.setFontSize(30);
  doc.text(opts.code, cx, 172, { align: "center" });

  // Steps.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(40, 40, 40);
  const steps = [
    "1.  Scan the QR code (or type the link above)",
    "2.  Enter the access code shown here",
    "3.  You're in — stays active on your device for 30 days",
  ];
  steps.forEach((s, i) => doc.text(s, cx - 60, 194 + i * 9));

  // Scope callout.
  const scopeText =
    opts.scope === "wifi"
      ? "You'll see: WiFi network names & passwords for this campus"
      : "You'll see: equipment status & when each item was last serviced";
  doc.setFillColor(248, 232, 233);
  doc.roundedRect(cx - 70, 226, 140, 16, 3, 3, "F");
  doc.setTextColor(...BRAND_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(scopeText, cx, 235, { align: "center", maxWidth: 132 });

  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Campus: ${opts.campusName}`, cx, 252, { align: "center" });

  drawFooter(doc, pageW, pageH);
  doc.save(`Arise-Access-${opts.label.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`);
}

export async function generateRequestPoster(opts: { baseUrl: string; campusName?: string }) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cx = pageW / 2;
  const logo = await loadDataUrl(iconUrl);
  const url = `${opts.baseUrl}/request`;
  const qr = await qrDataUrl(url);

  drawHeader(doc, logo, pageW);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text("Need IT Help?", cx, 52, { align: "center" });

  doc.setTextColor(...BRAND_RED);
  doc.setFontSize(16);
  doc.text("Scan to submit a request", cx, 63, { align: "center" });

  const qrSize = 92;
  doc.addImage(qr, "PNG", cx - qrSize / 2, 72, qrSize, qrSize);

  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text(`No account needed. Or go to  ${url}`, cx, 176, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  const steps = [
    "1.  Scan the QR code with your phone camera",
    "2.  Tell us your name, campus, and the problem",
    "3.  Our IT team gets it right away",
  ];
  steps.forEach((s, i) => doc.text(s, cx - 62, 196 + i * 10));

  if (opts.campusName) {
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(12);
    doc.text(opts.campusName, cx, 238, { align: "center" });
  }

  drawFooter(doc, pageW, pageH);
  doc.save("Arise-IT-Request-Poster.pdf");
}

export interface LabelAsset {
  id: number;
  assetTag: string;
  brand: string;
  modelName: string;
}

// Multi-up QR label sheet for tagging gear. 3 columns × 8 rows per Letter page.
export async function generateLabelSheet(assets: LabelAsset[], baseUrl: string) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cols = 3;
  const rows = 8;
  const marginX = 12;
  const marginY = 12;
  const cellW = (pageW - marginX * 2) / cols;
  const cellH = (pageH - marginY * 2) / rows;

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const posOnPage = i % (cols * rows);
    if (i > 0 && posOnPage === 0) doc.addPage();
    const col = posOnPage % cols;
    const row = Math.floor(posOnPage / cols);
    const x = marginX + col * cellW;
    const y = marginY + row * cellH;

    const qr = await qrDataUrl(`${baseUrl}/assets/${a.id}`);
    const qrSize = Math.min(cellW, cellH) * 0.52;
    doc.addImage(qr, "PNG", x + (cellW - qrSize) / 2, y + 3, qrSize, qrSize);

    doc.setTextColor(11, 11, 12);
    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    doc.text(a.assetTag, x + cellW / 2, y + qrSize + 8, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`${a.brand} ${a.modelName}`.slice(0, 28), x + cellW / 2, y + qrSize + 13, {
      align: "center",
      maxWidth: cellW - 4,
    });
  }

  doc.save("Arise-Asset-Labels.pdf");
}
