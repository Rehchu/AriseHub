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
}

/** Is DYMO Connect running here, and which printers does it see? */
export async function getDymoStatus(): Promise<DymoStatus> {
  const fw = await loadDymo();
  if (!fw) return { available: false, printers: [], reason: "DYMO SDK could not load." };
  try {
    const env = fw.checkEnvironment();
    if (!env.isFrameworkInstalled) {
      return {
        available: false,
        printers: [],
        reason: "DYMO Connect isn't running on this computer.",
      };
    }
    const printers = fw
      .getPrinters()
      .filter((p) => p.isConnected !== false)
      .map((p) => p.name);
    return {
      available: printers.length > 0,
      printers,
      reason: printers.length ? undefined : "DYMO Connect is running but no printer is connected.",
    };
  } catch (e) {
    return {
      available: false,
      printers: [],
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
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, "")}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: d, options: o }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Label XML for a 30252 Address label (landscape). Object names are referenced
// by setObjectText below, so keep them in sync.
function labelXml(o: NameTagOptions, variant: "child" | "guardian") {
  const nameSize = Math.round((variant === "guardian" ? 16 : 22) * o.fontScale);
  const metaSize = Math.round(9 * o.fontScale);
  const codeSize = Math.round((variant === "guardian" ? 24 : 15) * o.fontScale);

  const text = (name: string, x: number, y: number, w: number, h: number, size: number, bold: boolean, align: string) => `
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
          <String></String>
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
): Promise<boolean> {
  const fw = await loadDymo();
  if (!fw) return false;
  try {
    const env = fw.checkEnvironment();
    if (!env.isFrameworkInstalled) return false;
    const printers = fw.getPrinters();
    const printer = printerName || printers[0]?.name;
    if (!printer) return false;

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
    return true;
  } catch {
    return false;
  }
}
