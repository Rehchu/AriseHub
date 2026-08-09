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

import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const PORT = portArg !== -1 ? Number(args[portArg + 1]) : 41952;
const HERE = dirname(fileURLToPath(import.meta.url));

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

/**
 * TLS, because without it this agent cannot be used at all.
 *
 * AriseHub is served over https. A page on https may not fetch a plain http
 * URL — the browser blocks it as mixed content before a request is even made.
 * So the agent listening on http could never be reached from the real site:
 * http:// is blocked, and https:// had nothing listening. It fell through to
 * the browser print dialog every time, which is why an iPad only ever offered
 * AirPrint printers.
 *
 * A self-signed certificate is correct here — this is a box on the church LAN,
 * not a public host, and there is no CA that will issue for 192.168.x.x. The
 * tablet has to trust it once (see the startup instructions).
 */
const CERT_DIR = join(HERE, "certs");
const CERT_FILE = join(CERT_DIR, "agent.crt");
const KEY_FILE = join(CERT_DIR, "agent.key");

/** Does this certificate name every address a tablet might dial? */
function certCovers(certPem, addrs) {
  if (addrs.length === 0) return true;
  try {
    // Compare whole entries, not substrings: "10.0.0.1" is a substring of
    // "10.0.0.18", so includes() would call a stale certificate good.
    const entries = (new X509Certificate(certPem).subjectAltName ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^(IP Address|DNS):/, ""));
    return addrs.every((a) => entries.includes(a));
  } catch {
    return false; // unreadable cert — safer to rebuild than to serve it
  }
}

function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

function ensureCert() {
  const certArg = argValue("--cert");
  const keyArg = argValue("--key");
  if (certArg && keyArg) return { cert: readFileSync(certArg), key: readFileSync(keyArg) };

  if (existsSync(CERT_FILE) && existsSync(KEY_FILE)) {
    const cert = readFileSync(CERT_FILE);
    // A cached certificate names the IPs this machine had when it was made.
    // Move the laptop from home to the church, or let DHCP hand it a new
    // address, and iOS rejects it for the address the tablet actually dials —
    // silently, because a refused TLS handshake looks like "printer not found".
    // So check, and rebuild it when the addresses have drifted.
    if (certCovers(cert, lanAddresses())) return { cert, key: readFileSync(KEY_FILE) };
    console.log("  This machine's IP changed since the certificate was made — regenerating.");
    console.log("  Each tablet will need to accept the new certificate once.\n");
  }

  // The cert must name the IPs the tablet will actually dial, or iOS rejects it
  // even after the warning is accepted.
  const san = ["IP:127.0.0.1", "DNS:localhost", ...lanAddresses().map((a) => `IP:${a}`)].join(",");
  try {
    mkdirSync(CERT_DIR, { recursive: true });
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", KEY_FILE, "-out", CERT_FILE,
        "-days", "3650",
        "-subj", "/CN=AriseHub Print Agent",
        "-addext", `subjectAltName=${san}`,
      ],
      { stdio: "ignore" },
    );
    console.log("  Generated a self-signed certificate in ./certs\n");
    return { cert: readFileSync(CERT_FILE), key: readFileSync(KEY_FILE) };
  } catch {
    return null;
  }
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

const tls = args.includes("--http") ? null : ensureCert();
const scheme = tls ? "https" : "http";

const handler = async (req, res) => {
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
};

const server = tls ? createHttpsServer(tls, handler) : createHttpServer(handler);

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
  if (!tls) {
    console.log("\n  ⚠ Running WITHOUT TLS.");
    console.log("    AriseHub is served over https, and a browser refuses to let an https page");
    console.log("    reach a plain http address (mixed content). Tablets will silently fall back");
    console.log("    to the AirPrint dialog instead of using this printer.");
    console.log("    Install openssl (Git for Windows includes it) and restart, or pass");
    console.log("    --cert and --key.\n");
  }

  console.log(`\n  Enter ONE of these in AriseHub → Check-In → Name tags → Print server:`);
  for (const a of addrs) console.log(`    ${scheme}://${a}:${PORT}`);

  if (tls) {
    console.log("\n  FIRST TIME ON EACH TABLET — do this once, or printing will fail silently:");
    console.log("    1. Open the SAME address you entered above, with /status on the end,");
    console.log("       in Safari on the tablet. For example:");
    console.log(`         ${scheme}://${addrs[0] ?? "192.168.1.50"}:${PORT}/status`);
    console.log("    2. Tap through the certificate warning (Show Details → visit this website)");
    console.log("    3. You should see {\"ok\":true,...}. Now check-in can print here.");
    console.log("\n  The certificate is self-signed because no authority issues certs for a");
    console.log("  192.168.x.x address. It lives in ./certs and lasts 10 years.");
  }

  console.log("\n  Leave this window open while check-in is running. Ctrl+C to stop.\n");
});
