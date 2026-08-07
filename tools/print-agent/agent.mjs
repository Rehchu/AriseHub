#!/usr/bin/env node
/**
 * AriseHub print agent.
 *
 * iPads can't talk to a DYMO LabelWriter — DYMO Connect is desktop-only, and
 * Chrome 142+ blocks pages from reaching localhost services anyway. This agent
 * runs on ONE desktop or laptop next to the printer and prints on behalf of any
 * device on the same network.
 *
 *   iPad → (LAN HTTP) → this agent → DYMO Connect → printer
 *
 * Usage:
 *   node agent.mjs                 # port 41952
 *   node agent.mjs --port 5000
 *
 * Then in AriseHub: Check-In → Name tags → Print server, enter the address it
 * prints on startup (e.g. http://192.168.1.50:41952).
 */

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";

const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const PORT = portArg !== -1 ? Number(args[portArg + 1]) : 41952;

// DYMO Connect's local web service. It is HTTPS with a self-signed cert, so we
// must not verify it — this is a loopback connection to software on this
// machine, not a network trust boundary.
const DYMO_BASE = "https://127.0.0.1:41951/DYMO/DLS/Printing";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function lanAddresses() {
  const out = [];
  for (const [, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}

async function dymo(path, body) {
  const res = await fetch(`${DYMO_BASE}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`DYMO ${path} returned ${res.status}`);
  return res.text();
}

async function getPrinters() {
  const xml = await dymo("GetPrinters");
  // The service returns XML; pull out the printer names.
  return [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    // Any device on the church network may call this.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});

  try {
    // --- health / discovery ---------------------------------------------
    if (req.url === "/status" || req.url === "/") {
      let printers = [];
      let dymoUp = true;
      try {
        printers = await getPrinters();
      } catch {
        dymoUp = false;
      }
      return json(res, 200, { ok: true, agent: "arisehub-print-agent", dymoUp, printers });
    }

    // --- print ------------------------------------------------------------
    if (req.method === "POST" && req.url === "/print") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const payload = JSON.parse(Buffer.concat(chunks).toString() || "{}");

      const { labelXml, printerName } = payload;
      if (!labelXml) return json(res, 400, { error: "labelXml required" });

      const printers = await getPrinters();
      const printer = printerName && printers.includes(printerName) ? printerName : printers[0];
      if (!printer) return json(res, 503, { error: "No DYMO printer found on this machine." });

      const params = new URLSearchParams();
      params.set("printerName", printer);
      params.set("printParamsXml", "");
      params.set("labelXml", labelXml);
      params.set("labelSetXml", "");
      await dymo("PrintLabel", params.toString());

      console.log(`[${new Date().toLocaleTimeString()}] printed on ${printer}`);
      return json(res, 200, { ok: true, printer });
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error("error:", e.message);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", async () => {
  const addrs = lanAddresses();
  console.log("\n  AriseHub print agent\n  ────────────────────");
  let printers = [];
  try {
    printers = await getPrinters();
    console.log(
      printers.length
        ? `  Printers: ${printers.join(", ")}`
        : "  No DYMO printer detected — check it's plugged in and DYMO Connect is running.",
    );
  } catch {
    console.log("  DYMO Connect not detected. Install it and make sure it's running.");
  }
  console.log("\n  Enter ONE of these in AriseHub → Check-In → Name tags → Print server:");
  for (const a of addrs) console.log(`    http://${a}:${PORT}`);
  console.log("\n  Leave this window open while check-in is running. Ctrl+C to stop.\n");
});
