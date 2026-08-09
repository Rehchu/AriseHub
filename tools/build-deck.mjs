/**
 * Builds the AriseHub approval deck.
 *
 * Run: node tools/build-deck.mjs
 * Out: AriseHub-Overview.pptx in the repo root.
 *
 * Screenshots are optional. Drop PNGs into tools/deck-shots/ named
 * checkin.png, designer.png, messages.png, people.png, admin.png, dashboard.png
 * and they get embedded; anything missing renders as a labelled placeholder so
 * the deck is always presentable.
 */
import PptxGenJS from "pptxgenjs";
import fs from "node:fs";
import path from "node:path";

const SHOTS = path.join(process.cwd(), "tools", "deck-shots");
const shot = (name) => {
  const p = path.join(SHOTS, name);
  return fs.existsSync(p) ? p : null;
};

// Arise brand: the flame red, near-black chrome, light canvas.
const RED = "D2303B";
const INK = "0B0B0C";
const BODY = "34353B";
const MUTED = "6D6E76";
const LINE = "E2E2E4";
const WASH = "F6F6F7";
const GOOD = "047857";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_16x9";
pptx.author = "Arise Church";
pptx.company = "Arise Church · Pineville, LA";
pptx.title = "AriseHub";

/** Title + optional kicker, consistent on every content slide. */
function head(s, title, kicker) {
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: 0.55, y: 0.38, w: 9, h: 0.25,
      fontSize: 11, bold: true, color: RED, charSpacing: 1.4,
    });
  }
  s.addText(title, {
    x: 0.55, y: kicker ? 0.66 : 0.5, w: 9, h: 0.6,
    fontSize: 30, bold: true, color: INK,
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0.55, y: kicker ? 1.32 : 1.16, w: 0.9, h: 0.045, fill: { color: RED },
  });
}

function slide() {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  return s;
}

/** A screenshot, or a labelled placeholder that still looks deliberate. */
function picture(s, file, caption, box) {
  const p = shot(file);
  if (p) {
    s.addImage({ path: p, ...box, sizing: { type: "contain", w: box.w, h: box.h } });
  } else {
    s.addShape(pptx.ShapeType.roundRect, {
      ...box, fill: { color: WASH }, line: { color: LINE, width: 1, dashType: "dash" }, rectRadius: 0.08,
    });
    s.addText(`[ ${caption} ]`, {
      x: box.x, y: box.y + box.h / 2 - 0.2, w: box.w, h: 0.4,
      align: "center", fontSize: 12, color: MUTED, italic: true,
    });
  }
}

/* ------------------------------------------------------------------ 1. Title */
{
  const s = slide();
  s.background = { color: INK };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.28, h: 5.63, fill: { color: RED } });
  s.addText(
    [
      { text: "Arise", options: { color: "FFFFFF" } },
      { text: "Hub", options: { color: RED } },
    ],
    { x: 1.1, y: 1.7, w: 8, h: 1.0, fontSize: 54, bold: true },
  );
  s.addText("One platform for people, ministry and IT", {
    x: 1.1, y: 2.7, w: 8, h: 0.45, fontSize: 20, color: "C5C6CA",
  });
  s.addText("Arise Church · Pineville, Louisiana · Two campuses", {
    x: 1.1, y: 3.25, w: 8, h: 0.35, fontSize: 13, color: "9A9BA1",
  });
  s.addText("Built for approval review", {
    x: 1.1, y: 4.55, w: 8, h: 0.3, fontSize: 11, color: MUTED, italic: true,
  });
}

/* --------------------------------------------------------- 2. What it is */
{
  const s = slide();
  head(s, "What AriseHub is", "Overview");
  s.addText(
    "A church management platform written specifically for Arise Church, running on our own infrastructure, with our data in our own database.",
    { x: 0.55, y: 1.62, w: 8.9, h: 0.7, fontSize: 16, color: BODY, lineSpacing: 24 },
  );
  const cards = [
    ["Members & families", "Directory, households, guardians, custom fields"],
    ["Children's check-in", "Codes, badges, pickup verification, offline"],
    ["Messaging", "Department chats and direct messages"],
    ["Services", "Plans, rotas, songs, availability"],
    ["Calendar & rooms", "Events, booking, double-booking guard"],
    ["IT support", "Tickets, assets, WiFi vault, passwords"],
  ];
  cards.forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.55 + col * 3.03, y = 2.5 + row * 1.35;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 2.83, h: 1.15, fill: { color: WASH }, line: { color: LINE, width: 1 }, rectRadius: 0.06,
    });
    s.addText(c[0], { x: x + 0.18, y: y + 0.14, w: 2.5, h: 0.3, fontSize: 13, bold: true, color: INK });
    s.addText(c[1], { x: x + 0.18, y: y + 0.46, w: 2.5, h: 0.6, fontSize: 10, color: MUTED });
  });
}

/* ------------------------------------------------- 3. Why not off-the-shelf */
{
  const s = slide();
  head(s, "Why we built rather than bought", "Rationale");
  const rows = [
    ["Our workflow, not a generic one", "Pickup verification, sibling check-in, our own badge layouts and our two-campus structure are built to how Arise actually runs a Sunday."],
    ["IT and ministry in one place", "Nobody else joins a church management system to an IT helpdesk. Staff raise a ticket from the same app they check a child in with."],
    ["No per-seat or per-module cost", "Adding a volunteer, a department or a campus costs nothing. Growth doesn't change the bill."],
    ["We own the data and the code", "The database is ours. Nothing is locked behind an export tool or a vendor's roadmap."],
  ];
  rows.forEach((r, i) => {
    const y = 1.68 + i * 0.93;
    s.addShape(pptx.ShapeType.rect, { x: 0.55, y: y + 0.05, w: 0.045, h: 0.62, fill: { color: RED } });
    s.addText(r[0], { x: 0.78, y, w: 8.6, h: 0.3, fontSize: 15, bold: true, color: INK });
    s.addText(r[1], { x: 0.78, y: y + 0.32, w: 8.6, h: 0.5, fontSize: 11.5, color: MUTED });
  });
}

/* ------------------------------------------------------ 4. Children's check-in */
{
  const s = slide();
  head(s, "Children's check-in", "Safeguarding");
  s.addText("The part of the platform that carries the most risk, and where the most care went.", {
    x: 0.55, y: 1.6, w: 8.9, h: 0.35, fontSize: 13, color: MUTED,
  });
  const pts = [
    "Six-character pickup codes from an unambiguous alphabet — no O/0 or I/1 to misread at a busy desk. A unique index makes a collision between two present children impossible.",
    "Pickup verification: the station shows the child's authorised guardians and won't release until a volunteer names who collected them — or records why they released to someone else.",
    "Allergy flags print on the badge and are visible at the desk; the medical notes behind them are readable only by those who need them.",
    "Works offline. Check-ins are saved on the tablet and sync when the wifi returns, with an idempotency key so a lost reply can't check a child in twice.",
    "Tablet lockdown: kiosk mode keeps the screen awake, refuses to leave check-in, and needs a PIN to exit.",
    "Automatic check-out closes the roster at set times, marked as unverified so attendance stays honest.",
  ];
  pts.forEach((t, i) => {
    s.addText(t, {
      x: 0.55, y: 2.06 + i * 0.53, w: 5.55, h: 0.5, fontSize: 10.5, color: BODY,
      bullet: { type: "bullet" }, lineSpacing: 14,
    });
  });
  picture(s, "checkin.png", "Check-in station", { x: 6.35, y: 2.0, w: 3.1, h: 2.9 });
}

/* --------------------------------------------------------------- 5. Security */
{
  const s = slide();
  head(s, "How access is controlled", "Security");
  s.addText(
    "Permissions live in the database, not the screens. Every query runs under the signed-in person's identity, so a page that forgets to check still cannot return data they aren't entitled to.",
    { x: 0.55, y: 1.6, w: 8.9, h: 0.65, fontSize: 13, color: BODY, lineSpacing: 20 },
  );
  const stats = [
    ["Row-level security", "on every table holding people's data"],
    ["64 migrations", "every schema change versioned and reviewable"],
    ["190 automated tests", "run as the actual roles, against the real database"],
    ["Audit log", "privileged changes are recorded, including who and what"],
  ];
  stats.forEach((st, i) => {
    const x = 0.55 + (i % 2) * 4.55, y = 2.42 + Math.floor(i / 2) * 1.05;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 4.35, h: 0.9, fill: { color: WASH }, line: { color: LINE, width: 1 }, rectRadius: 0.06,
    });
    s.addText(st[0], { x: x + 0.2, y: y + 0.12, w: 4, h: 0.3, fontSize: 14, bold: true, color: RED });
    s.addText(st[1], { x: x + 0.2, y: y + 0.45, w: 4, h: 0.35, fontSize: 10.5, color: MUTED });
  });
  s.addText(
    "Contact details, children's medical notes and private department rosters are each gated separately — being able to see a name does not mean being able to see an address.",
    { x: 0.55, y: 4.62, w: 8.9, h: 0.5, fontSize: 11, color: MUTED, italic: true },
  );
}

/* ------------------------------------------------------------ 6. Who sees what */
{
  const s = slide();
  head(s, "Who sees what", "Access model");
  const rows = [
    ["Super Admin", "Runs the system. Does not see department chats they aren't in."],
    ["Admin — Apostle, Pastor", "Full access, including every department conversation."],
    ["Department Head", "Leads their department: roster, invites, their own schedule."],
    ["Staff", "Church-wide working access."],
    ["Volunteer / Praise Team Member", "Same level, two names. Access follows the department they serve in."],
    ["Member", "Their own profile, groups they join, the directory."],
  ];
  s.addTable(
    [
      [
        { text: "Level", options: { bold: true, color: "FFFFFF", fill: { color: INK }, fontSize: 11 } },
        { text: "What it means", options: { bold: true, color: "FFFFFF", fill: { color: INK }, fontSize: 11 } },
      ],
      ...rows.map((r, i) => [
        { text: r[0], options: { bold: true, fontSize: 10.5, color: INK, fill: { color: i % 2 ? "FFFFFF" : WASH } } },
        { text: r[1], options: { fontSize: 10.5, color: BODY, fill: { color: i % 2 ? "FFFFFF" : WASH } } },
      ]),
    ],
    { x: 0.55, y: 1.68, w: 8.9, colW: [2.7, 6.2], border: { pt: 0.5, color: LINE }, rowH: 0.42 },
  );
  s.addText(
    "Check-in is the deliberate exception: it follows the department rather than the rank, because the person who checks children in on a Sunday isn't always senior — and the Praise Team never does it.",
    { x: 0.55, y: 4.72, w: 8.9, h: 0.5, fontSize: 11, color: MUTED, italic: true },
  );
}

/* --------------------------------------------------------- 7. Also included */
{
  const s = slide();
  head(s, "The rest of the platform", "Functionality");
  const cols = [
    ["Messaging", ["A private chat per department", "Direct messages", "Private support thread with IT", "Turn a conversation into a ticket"]],
    ["Services", ["Service plans and running order", "Rotas with accept / decline", "Song library and keys", "Blockout dates and availability"]],
    ["Everything else", ["Groups and attendance", "Calendar with room booking", "Public forms / Connect Cards", "Tasks, ideas, reports"]],
  ];
  cols.forEach((c, i) => {
    const x = 0.55 + i * 3.03;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.68, w: 2.83, h: 0.04, fill: { color: RED } });
    s.addText(c[0], { x, y: 1.82, w: 2.83, h: 0.35, fontSize: 15, bold: true, color: INK });
    c[1].forEach((t, j) => {
      s.addText(t, {
        x, y: 2.26 + j * 0.46, w: 2.83, h: 0.42, fontSize: 11, color: BODY,
        bullet: { type: "bullet" },
      });
    });
  });
  s.addText("Installs to a phone's home screen like an app, and sends notifications — no app store, no download.", {
    x: 0.55, y: 4.5, w: 8.9, h: 0.4, fontSize: 11.5, color: MUTED, italic: true,
  });
}

/* ------------------------------------------------------------- 8. Screenshots */
{
  const s = slide();
  head(s, "The platform in use", "Screens");
  // Two per slide rather than a 2x2 grid: at 1196x718 a quartered box letterboxes
  // each shot down to under three inches, which is unreadable from a back row.
  picture(s, "dashboard.png", "Dashboard — ministry and IT behind one login", { x: 0.5, y: 1.68, w: 4.35, h: 2.6 });
  picture(s, "checkin.png", "Check-in station — find a child, or release one by code", { x: 5.15, y: 1.68, w: 4.35, h: 2.6 });
}

/* ------------------------------------------------------- 8b. More screens */
{
  const s = slide();
  head(s, "The platform in use", "Screens");
  picture(s, "designer.png", "Name tag designer", { x: 0.42, y: 1.68, w: 2.9, h: 1.74 });
  picture(s, "messages.png", "Department messaging", { x: 3.55, y: 1.68, w: 2.9, h: 1.74 });
  picture(s, "safeguarding.png", "Check-in safeguarding settings", { x: 6.68, y: 1.68, w: 2.9, h: 1.74 });
}

/* ------------------------------------------------------------ 9. Comparison */
{
  const s = slide();
  head(s, "AriseHub, Planning Center and Elvanto", "Comparison");
  const T = (t, o = {}) => ({ text: t, options: { fontSize: 9.5, color: BODY, valign: "middle", ...o } });
  const H = (t) => ({ text: t, options: { bold: true, fontSize: 10, color: "FFFFFF", fill: { color: INK }, valign: "middle" } });
  s.addTable(
    [
      [H(""), H("AriseHub"), H("Planning Center"), H("Elvanto")],
      [T("Shape", { bold: true, color: INK }), T("One app, built for us"), T("Suite of modules, bought separately"), T("One all-in-one system")],
      [T("Cost", { bold: true, color: INK }), T("$0 / month", { color: GOOD, bold: true }), T("$313 / month at our sizes"), T("$119 / month (All Access)")],
      [T("Children's check-in", { bold: true, color: INK }), T("Included, with pickup verification and offline"), T("Strong — a paid module"), T("Included")],
      [T("Service planning", { bold: true, color: INK }), T("Plans, rotas, songs, availability"), T("Best in class — their flagship"), T("Solid")],
      [T("Giving / donations", { bold: true, color: INK }, ), T("Not built", { color: "B8232E", bold: true }), T("Yes"), T("Yes (via Tithe.ly)")],
      [T("IT helpdesk", { bold: true, color: INK }), T("Yes — tickets, assets, WiFi vault", { color: GOOD, bold: true }), T("No"), T("No")],
      [T("Data ownership", { bold: true, color: INK }), T("Our own database, full access"), T("Vendor-hosted, export tools"), T("Vendor-hosted, export tools")],
      [T("Support", { bold: true, color: INK }), T("In-house only", { color: "B8232E", bold: true }), T("Vendor support team"), T("Vendor support team")],
    ],
    {
      x: 0.5, y: 1.62, w: 9.0, colW: [1.75, 2.55, 2.4, 2.3],
      border: { pt: 0.5, color: LINE }, rowH: 0.36, autoPage: false,
    },
  );
  s.addText(
    "Planning Center is priced per module and scales with size — $313 is a real quote at our volumes. Elvanto/Tithe.ly All Access is $119/mo (list $228).",
    { x: 0.5, y: 5.02, w: 9, h: 0.3, fontSize: 9, color: MUTED, italic: true },
  );
}

/* ------------------------------------------------------------ 9b. The cost */
{
  const s = slide();
  head(s, "What it costs", "Cost");

  const cards = [
    ["AriseHub + AriseIT", "$0", "per month", "$0 a year", GOOD],
    ["Planning Center", "$313", "per month, at our sizes", "$3,756 a year", INK],
    ["Elvanto / Tithe.ly", "$119", "per month, All Access", "$1,428 a year", INK],
  ];
  cards.forEach(([name, big, unit, yearly, col], i) => {
    const x = 0.5 + i * 3.05;
    s.addShape(pptx.ShapeType.rect, {
      x, y: 1.55, w: 2.85, h: 1.72,
      fill: { color: i === 0 ? "F2FBF6" : "FFFFFF" },
      line: { color: i === 0 ? GOOD : LINE, pt: i === 0 ? 1.25 : 0.75 },
    });
    s.addText(name, { x: x + 0.18, y: 1.68, w: 2.5, h: 0.26, fontSize: 10.5, bold: true, color: INK });
    s.addText(big, { x: x + 0.18, y: 1.98, w: 2.5, h: 0.55, fontSize: 30, bold: true, color: col });
    s.addText(unit, { x: x + 0.18, y: 2.52, w: 2.5, h: 0.24, fontSize: 9, color: MUTED });
    s.addText(yearly, { x: x + 0.18, y: 2.82, w: 2.5, h: 0.28, fontSize: 11, bold: true, color: col });
  });

  s.addText(
    "Planning Center is priced per module. $313 is the real quote at our volumes — 150 team members, 150 event attendees, " +
      "500 donations a month, 75 Sunday check-ins, 200 group members, 15 rooms. Every one of those raises the price as the church grows.",
    { x: 0.5, y: 3.44, w: 9, h: 0.5, fontSize: 10.5, color: BODY },
  );

  // The one weakness we have, and the fact that it costs nothing to close, belong
  // on the same slide — leadership will ask about giving the moment they see $0.
  s.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 4.02, w: 9, h: 1.0, fill: { color: "FBF3F4" }, line: { color: RED, pt: 1 },
  });
  s.addText(
    [
      { text: "AriseHub has no giving module — and it costs nothing to fix. ", options: { bold: true, color: INK } },
      {
        text: "Tithe.ly Giving is free on its own: unlimited donations, the giving app, recurring gifts and " +
          "year-end tax statements. AriseHub for ministry and IT, Tithe.ly for giving, covers everything on the " +
          "previous slide — still at $0 a month.",
        options: { color: BODY },
      },
    ],
    { x: 0.72, y: 4.14, w: 8.56, h: 0.78, fontSize: 10.5 },
  );

  s.addText(
    "AriseHub runs inside the free tiers at our size. Real growth would eventually mean a hosting bill measured in tens of dollars a year, not hundreds a month.",
    { x: 0.5, y: 5.08, w: 9, h: 0.3, fontSize: 9, color: MUTED, italic: true },
  );
}

/* ------------------------------------------------- 10. Where each one wins */
{
  const s = slide();
  head(s, "An honest read", "Trade-offs");
  const panels = [
    ["Where AriseHub wins", GOOD, [
      "Built to how Arise actually runs a Sunday",
      "IT support and ministry in one login",
      "No cost per volunteer, department or campus",
      "Changes ship the same day they're asked for",
      "We own the data outright",
    ]],
    ["Where the others win", "B8232E", [
      "Giving — we have none (Tithe.ly gives it away free)",
      "A support team that isn't one person",
      "Years of use across thousands of churches",
      "Native mobile apps in the app stores",
      "Published integrations with other tools",
    ]],
  ];
  panels.forEach((p, i) => {
    const x = 0.55 + i * 4.55;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.68, w: 4.35, h: 3.2, fill: { color: WASH }, line: { color: LINE, width: 1 }, rectRadius: 0.06,
    });
    s.addShape(pptx.ShapeType.rect, { x, y: 1.68, w: 4.35, h: 0.05, fill: { color: p[1] } });
    s.addText(p[0], { x: x + 0.22, y: 1.86, w: 3.9, h: 0.35, fontSize: 14, bold: true, color: p[1] });
    p[2].forEach((t, j) => {
      s.addText(t, {
        x: x + 0.22, y: 2.32 + j * 0.5, w: 3.9, h: 0.46, fontSize: 10.5, color: BODY,
        bullet: { type: "bullet" },
      });
    });
  });
}

/* ------------------------------------------------------------- 11. The risk */
{
  const s = slide();
  head(s, "The honest risk", "What to weigh");
  s.addText(
    "The single biggest difference between AriseHub and the alternatives is not a feature. It is that Planning Center and Elvanto are companies, and AriseHub is us.",
    { x: 0.55, y: 1.62, w: 8.9, h: 0.7, fontSize: 15, color: INK, bold: true, lineSpacing: 22 },
  );
  const rows = [
    ["If the person maintaining it stops", "The code and data are ours and documented, but there is no vendor to call on a Sunday morning. This is the real question to ask."],
    ["It is young", "Planning Center has been refined by thousands of churches for over a decade. AriseHub has been refined by one, over months."],
    ["Giving is not built", "If online giving is required, it stays with whatever we use today, or it gets built."],
    ["What reduces the risk", "Automated tests that run as real roles, versioned migrations, an audit log, and no lock-in — the data can be exported to any of these products at any time."],
  ];
  rows.forEach((r, i) => {
    const y = 2.46 + i * 0.66;
    s.addText(r[0], { x: 0.55, y, w: 2.85, h: 0.5, fontSize: 11.5, bold: true, color: i === 3 ? GOOD : INK });
    s.addText(r[1], { x: 3.5, y, w: 5.95, h: 0.6, fontSize: 10.5, color: MUTED });
  });
}

/* ------------------------------------------------------------- 12. Closing */
{
  const s = slide();
  s.background = { color: INK };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.28, h: 5.63, fill: { color: RED } });
  s.addText("Where it stands today", { x: 1.1, y: 1.35, w: 8, h: 0.55, fontSize: 30, bold: true, color: "FFFFFF" });
  const pts = [
    "Live and in use at arisehub.myfaithtech.com",
    "Children's check-in, messaging, services, calendar, groups, forms and IT support all working",
    "Security reviewed and covered by automated tests",
    "Still to come: giving, and whatever the first month of real use turns up",
  ];
  pts.forEach((t, i) => {
    s.addText(t, {
      x: 1.1, y: 2.25 + i * 0.5, w: 8.2, h: 0.45, fontSize: 13, color: "C5C6CA",
      bullet: { type: "bullet" },
    });
  });
  s.addText("Arise Church · Pineville, Louisiana", {
    x: 1.1, y: 4.75, w: 8, h: 0.3, fontSize: 10.5, color: MUTED,
  });
}

const out = path.join(process.cwd(), "AriseHub-Overview.pptx");
await pptx.writeFile({ fileName: out });
const missing = ["dashboard.png", "checkin.png", "designer.png", "messages.png", "safeguarding.png"].filter(
  (f) => !shot(f),
);
console.log(`Wrote ${out}`);
console.log(`Slides: 14`);
console.log(missing.length ? `Placeholders awaiting screenshots: ${missing.join(", ")}` : "All screenshots embedded.");
