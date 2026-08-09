import { printHtmlInFrame } from "./print-frame";

// DYMO Connect Web Service integration.
//
// The SDK talks to the DYMO Connect service running on the SAME computer
// (https://localhost:41951). That means:
//   * DYMO Connect must be installed AND running on the check-in station;
//   * printing cannot be triggered from our server — it's client-side only;
//   * an iPad can't print this way (no DYMO service on iOS) — those stations
//     fall back to the browser print dialog in lib/nametag.ts.
//
// The SDK is self-hosted at /dymo/dymo.connect.framework.js and loaded lazily,
// so it costs nothing on pages that never print.

import type { NameTagData, NameTagOptions } from "./nametag";

interface DymoFramework {
  init: (cb?: () => void) => void;
  checkEnvironment: () => { isBrowserSupported: boolean; isFrameworkInstalled: boolean; errorDetails?: string };
  getPrinters: () => Array<{ name: string; printerType?: string; isConnected?: boolean }>;
  openLabelXml: (xml: string) => { setObjectText: (name: string, text: string) => void; getLabelXml: () => string };
  printLabel: (printer: string, params: string, labelXml: string, data: string) => void;
}
declare global {
  interface Window {
    dymo?: { label: { framework: DymoFramework } };
  }
}

function xmlEscape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Which roll DYMO should expect for a given label size.
 *
 * This used to be hardcoded to "30252 Address" for every template, so a
 * 4 × 2.31in name badge was printed as a 3.5 × 1.125in address label — the
 * design was squashed onto the wrong stock. Sizes are matched with a small
 * tolerance because templates store inches as numerics.
 */
function paperStockFor(widthIn: number, heightIn: number): { id: string; paperName: string } {
  const table: { w: number; h: number; id: string; paperName: string }[] = [
    { w: 3.5, h: 1.125, id: "Address", paperName: "30252 Address" },
    { w: 3.5, h: 1.4375, id: "LargeAddress", paperName: "30321 Large Address" },
    { w: 4, h: 2.3125, id: "Shipping", paperName: "30256 Shipping" },
    { w: 4, h: 2.125, id: "Shipping", paperName: "30323 Shipping" },
    { w: 2.25, h: 1.25, id: "MultiPurpose", paperName: "30334 Multipurpose" },
    { w: 2.125, h: 1, id: "MultiPurpose", paperName: "30336 Multipurpose" },
    { w: 1, h: 1, id: "MultiPurpose", paperName: "30333 Multipurpose 1/2" },
  ];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
  const hit = table.find((t) => near(t.w, widthIn) && near(t.h, heightIn));
  // Unknown stock: fall back to the most common roll rather than emitting a
  // paper name DYMO doesn't recognise. The Bounds still carry the real size.
  return hit ?? table[0];
}

let loading: Promise<DymoFramework | null> | null = null;

/** Loads + initialises the SDK once. Resolves null if it isn't available. */
export function loadDymo(): Promise<DymoFramework | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (loading) return loading;

  loading = new Promise((resolve) => {
    const done = () => {
      const fw = window.dymo?.label?.framework;
      if (!fw) return resolve(null);
      try {
        fw.init(() => resolve(fw));
        // Some SDK builds never call the callback; resolve anyway shortly after.
        setTimeout(() => resolve(fw), 1500);
      } catch {
        resolve(null);
      }
    };

    if (window.dymo?.label?.framework) return done();
    const s = document.createElement("script");
    s.src = "/dymo/dymo.connect.framework.js";
    s.async = true;
    s.onload = done;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

export interface DymoStatus {
  available: boolean;
  printers: string[];
  reason?: string;
  /** Did /dymo/dymo.connect.framework.js load at all? */
  sdkLoaded?: boolean;
  /** Raw environment details, for the diagnostics panel. */
  environment?: string;
}

/**
 * Outcome of one print attempt.
 *
 * These used to return a bare boolean with the error swallowed in a catch, so a
 * label that never appeared gave you nothing to go on — which is exactly the
 * situation you are in when you are standing at the church on a Sunday morning
 * and it is not printing.
 */
export interface PrintResult {
  ok: boolean;
  /** Which path was tried: DYMO Connect here, the LAN agent, or the browser. */
  via: "dymo" | "agent" | "browser";
  error?: string;
}

/**
 * A LAN print agent on plain http cannot be reached from the https app —
 * browsers block it as mixed content, and the failure looks like a network
 * error rather than a policy one. Worth saying out loud before someone spends
 * an hour on it.
 */
export function agentUrlProblem(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) return "Needs to start with http:// or https://";
  if (
    u.toLowerCase().startsWith("http://") &&
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(u)
  ) {
    return "This page is https, so the browser will block a plain http agent (mixed content). Run the agent with TLS, or use the browser-print fallback.";
  }
  return null;
}

/** Is DYMO Connect running here, and which printers does it see? */
export async function getDymoStatus(): Promise<DymoStatus> {
  const fw = await loadDymo();
  if (!fw) {
    return {
      available: false,
      printers: [],
      sdkLoaded: false,
      reason:
        "The DYMO SDK didn't load. Check /dymo/dymo.connect.framework.js is being served, and that no extension is blocking it.",
    };
  }
  try {
    const env = fw.checkEnvironment();
    if (!env.isFrameworkInstalled) {
      return {
        available: false,
        printers: [],
        sdkLoaded: true,
        environment: env.errorDetails,
        reason:
          "DYMO Connect isn't answering on this computer. Start DYMO Connect, then open https://localhost:41951 once and accept its certificate — the page talks to the service over https and a browser that hasn't trusted it fails silently.",
      };
    }
    const printers = fw
      .getPrinters()
      .filter((p) => p.isConnected !== false)
      .map((p) => p.name);
    return {
      available: printers.length > 0,
      printers,
      sdkLoaded: true,
      environment: env.errorDetails,
      reason: printers.length ? undefined : "DYMO Connect is running but no printer is connected.",
    };
  } catch (e) {
    return {
      available: false,
      printers: [],
      sdkLoaded: true,
      reason: e instanceof Error ? e.message : "DYMO check failed.",
    };
  }
}

/**
 * Strategy 1 — central desktop print server.
 *
 * iPads can't run DYMO Connect, so a station tablet POSTs the tag to a small
 * agent running on a desktop that has the DYMO on USB. The agent holds the SDK
 * and does the actual printing. Configure the agent's LAN URL per device.
 *
 * Note: the agent must be reachable over http on the LAN; a browser on an
 * https page will block plain-http requests, so run the agent with TLS or use
 * the browser-print fallback on tablets.
 */
export async function printViaServer(
  d: NameTagData,
  o: NameTagOptions,
  serverUrl: string,
): Promise<PrintResult> {
  const blocked = agentUrlProblem(serverUrl);
  if (blocked) return { ok: false, via: "agent", error: blocked };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${serverUrl.replace(/\/$/, "")}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labelXml: buildTextLabelXml(d, o) }),
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { ok: false, via: "agent", error: `Agent replied ${res.status}` };
    return { ok: true, via: "agent" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      via: "agent",
      error: /abort/i.test(msg) ? "Agent didn't respond within 8s" : msg,
    };
  }
}

/**
 * Print a rendered design (PNG data URL) to the DYMO.
 *
 * Designs are rasterised by lib/tag-design.ts, then sent as a single full-bleed
 * ImageObject. Going via an image means the printed label matches the designer
 * exactly — no lossy translation into DYMO's text-layout XML.
 */
export async function printImageViaDymo(
  pngDataUrl: string,
  widthIn: number,
  heightIn: number,
  printerName?: string,
): Promise<PrintResult> {
  const fw = await loadDymo();
  if (!fw) return { ok: false, via: "dymo", error: "SDK not loaded" };
  try {
    if (!fw.checkEnvironment().isFrameworkInstalled) {
      return { ok: false, via: "dymo", error: "DYMO Connect not running on this computer" };
    }
    const printer = printerName || fw.getPrinters()[0]?.name;
    if (!printer) return { ok: false, via: "dymo", error: "No printer connected" };

    const xml = buildImageLabelXml(pngDataUrl, widthIn, heightIn);
    const label = fw.openLabelXml(xml);
    fw.printLabel(printer, "", label.getLabelXml(), "");
    return { ok: true, via: "dymo" };
  } catch (e) {
    // The real reason matters: "printer is offline" and "the label XML is
    // malformed" both used to surface as a silent false.
    return { ok: false, via: "dymo", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Legacy text-layout label, with values substituted in directly.
 *
 * The on-machine path fills fields through the SDK (setObjectText); the agent
 * receives finished XML, so the text is inlined here instead.
 */
export function buildTextLabelXml(d: NameTagData, o: NameTagOptions): string {
  const header = o.churchName ?? "";
  const meta = [o.showRoom ? d.room : "", o.showDate ? new Date().toLocaleDateString() : ""]
    .filter(Boolean)
    .join("  ");
  // Values are passed into the builder, which puts them inside <String>.
  //
  // This used to string-replace `>Header<` on finished XML. That pattern also
  // matches `<Name>Header</Name>`, so it renamed the object instead of filling
  // it — and the actual `<String></String>` stayed empty. Every label printed
  // through the agent came out blank.
  return labelXml(o, "child", {
    Header: header,
    ChildName: d.name,
    Meta: meta,
    Code: o.showCode ? d.code : "",
  });
}

/**
 * Build DYMO label XML wrapping a rendered PNG as a full-bleed image.
 * Shared by the direct (DYMO Connect on this machine) and agent paths.
 */
export function buildImageLabelXml(
  pngDataUrl: string,
  widthIn: number,
  heightIn: number,
): string {
  const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, "");
  // DYMO uses twips (1/1440 in) for bounds.
  const w = Math.round(widthIn * 1440);
  const h = Math.round(heightIn * 1440);
  const stock = paperStockFor(widthIn, heightIn);
  // Note on the two rectangles below: DrawCommands describes the die-cut in the
  // roll's own orientation (short edge first), while Bounds is in the rotated
  // landscape space. They are supposed to look transposed — the 30252 XML that
  // ships from DYMO does exactly this.
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>${stock.id}</Id>
  <PaperName>${stock.paperName}</PaperName>
  <DrawCommands><RoundRectangle X="0" Y="0" Width="${h}" Height="${w}" Rx="0" Ry="0" /></DrawCommands>
  <ObjectInfo>
    <ImageObject>
      <Name>TagImage</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Image>${base64}</Image>
      <ScaleMode>Fill</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BorderStyle>SolidLine</BorderStyle>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="0" Y="0" Width="${w}" Height="${h}" />
  </ObjectInfo>
</DieCutLabel>`;
}

/**
 * Print a rendered design through the shared desktop print agent.
 * This is the iPad path: tablets can't reach DYMO Connect, so they post the
 * label to an agent running on a desktop beside the printer.
 */
export async function printImageViaServer(
  pngDataUrl: string,
  widthIn: number,
  heightIn: number,
  serverUrl: string,
  printerName?: string,
): Promise<PrintResult> {
  const blocked = agentUrlProblem(serverUrl);
  if (blocked) return { ok: false, via: "agent", error: blocked };
  try {
    // Without a timeout an unreachable agent hangs the check-in desk until the
    // browser gives up, which can be a minute or more with a queue waiting.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${serverUrl.replace(/\/$/, "")}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labelXml: buildImageLabelXml(pngDataUrl, widthIn, heightIn),
        printerName,
      }),
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return { ok: false, via: "agent", error: `Agent replied ${res.status}` };
    }
    return { ok: true, via: "agent" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      via: "agent",
      error: /abort/i.test(msg) ? "Agent didn't respond within 8s" : msg,
    };
  }
}

/** Browser-print fallback for a rendered design. */
export function printImageViaBrowser(pngDataUrl: string, widthIn: number, heightIn: number) {
  printHtmlInFrame(`<!doctype html><html><head><title>Name tag</title><style>
    @page { size: ${widthIn}in ${heightIn}in; margin: 0; }
    html,body { margin:0; padding:0; }
    img { width:${widthIn}in; height:${heightIn}in; display:block; }
  </style></head><body><img src="${pngDataUrl}" alt="" /></body></html>`);
}

// Label XML for a 30252 Address label (landscape). Object names are referenced
// by setObjectText below, so keep them in sync.
function labelXml(
  o: NameTagOptions,
  variant: "child" | "guardian",
  values: Partial<Record<"Header" | "ChildName" | "Meta" | "Code", string>> = {},
) {
  const nameSize = Math.round((variant === "guardian" ? 16 : 22) * o.fontScale);
  const metaSize = Math.round(9 * o.fontScale);
  const codeSize = Math.round((variant === "guardian" ? 24 : 15) * o.fontScale);

  const text = (name: "Header" | "ChildName" | "Meta" | "Code", x: number, y: number, w: number, h: number, size: number, bold: boolean, align: string) => `
  <ObjectInfo>
    <TextObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>${align}</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${xmlEscape(values[name] ?? "")}</String>
          <Attributes>
            <Font Family="Segoe UI" Size="${size}" Bold="${bold ? "True" : "False"}" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${x}" Y="${y}" Width="${w}" Height="${h}" />
  </ObjectInfo>`;

  // Label area for 30252 in DYMO twips-ish units used by the framework.
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>30252 Address</PaperName>
  <DrawCommands><RoundRectangle X="0" Y="0" Width="1581" Height="5040" Rx="270" Ry="270" /></DrawCommands>
  ${text("Header", 331, 150, 4400, 220, Math.round(8 * o.fontScale), true, "Left")}
  ${text("ChildName", 331, 380, 4400, 620, nameSize, true, "Left")}
  ${text("Meta", 331, 1010, 2900, 300, metaSize, false, "Left")}
  ${text("Code", 3300, 950, 1500, 420, codeSize, true, "Right")}
</DieCutLabel>`;
}

/**
 * Print via DYMO Connect. Returns false if unavailable so the caller can fall
 * back to the browser print dialog.
 */
export async function printViaDymo(
  d: NameTagData,
  o: NameTagOptions,
  printerName?: string,
): Promise<PrintResult> {
  const fw = await loadDymo();
  if (!fw) return { ok: false, via: "dymo", error: "SDK not loaded" };
  try {
    const env = fw.checkEnvironment();
    if (!env.isFrameworkInstalled) {
      return { ok: false, via: "dymo", error: "DYMO Connect not running on this computer" };
    }
    const printers = fw.getPrinters();
    const printer = printerName || printers[0]?.name;
    if (!printer) return { ok: false, via: "dymo", error: "No printer connected" };

    const today = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const variants: Array<"child" | "guardian"> = o.showGuardianTag
      ? ["child", "guardian"]
      : ["child"];

    for (const variant of variants) {
      const label = fw.openLabelXml(labelXml(o, variant));
      const header = [
        o.showChurchName ? o.churchName : "",
        variant === "guardian" ? "PICKUP" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const meta = [
        o.showRoom ? d.room : "",
        o.showDate ? today : "",
        o.showAllergy && d.hasAllergy ? "** ALLERGY **" : "",
      ]
        .filter(Boolean)
        .join("   ");

      label.setObjectText("Header", header);
      label.setObjectText("ChildName", d.name);
      label.setObjectText("Meta", meta);
      label.setObjectText("Code", o.showCode ? d.code : "");

      fw.printLabel(printer, "", label.getLabelXml(), "");
    }
    return { ok: true, via: "dymo" };
  } catch (e) {
    return { ok: false, via: "dymo", error: e instanceof Error ? e.message : String(e) };
  }
}
