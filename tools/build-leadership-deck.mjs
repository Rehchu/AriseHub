/**
 * AriseHub Leadership Presentation.
 *
 * Run: node tools/build-leadership-deck.mjs
 * Out: AriseHub-Leadership-Presentation.pptx in the repo root.
 *
 * Dark, modern deck that matches the app's Nocturne look, so the (dark)
 * screenshots sit seamlessly on the slides. Screenshots live in tools/deck-shots/
 * and are embedded; a missing one becomes a labelled placeholder.
 *
 * Every screenshot is 1298x684. Image frames are sized to that exact aspect so
 * the picture FILLS its frame — no "contain" letterbox band (which reads as an
 * empty box in viewers other than PowerPoint). Text boxes carry fit:"shrink" so
 * nothing can overflow its box.
 */
import PptxGenJS from "pptxgenjs";
import fs from "node:fs";
import path from "node:path";
import { NOTES } from "./deck-notes.mjs";

const SHOTS = path.join(process.cwd(), "tools", "deck-shots");
const shot = (name) => {
  const p = path.join(SHOTS, name);
  return fs.existsSync(p) ? p : null;
};

// Real pixel aspect of every screenshot (1262 x 684, after the left capture
// margin was trimmed). Frames use this so pictures fill edge-to-edge.
const ASPECT = 1262 / 684;

// Palette — the app's Nocturne dark + Arise flame red + blurple accent.
const BG = "12141C";        // deep slide ground
const PANEL = "1C1F2B";     // raised panel
const GHOST = "1B1E2A";     // watermark number, barely above the ground
const LINE = "2C3040";      // hairline
const WHITE = "F3F5FE";
const BODY = "C5C6CA";
const MUTE = "9397AB";
const RED = "E4525F";       // flame red, lifted for dark ground
const REDDEEP = "D2303B";
const BLUR = "9184D9";      // Nocturne accent
const GOOD = "34D399";
const WARN = "FBBF24";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
pptx.layout = "W";
pptx.author = "Arise Church";
pptx.company = "Arise Church · Pineville, LA";
pptx.title = "AriseHub Leadership Presentation";
const W = 13.333;
const H = 7.5;

/** A full-bleed dark slide. */
function slide(color = BG) {
  const s = pptx.addSlide();
  s.background = { color };
  return s;
}

/**
 * Speaker notes.
 *
 * The slides carry headlines; these carry what to actually say, so nobody has
 * to stand there reading the screen aloud. They print in PowerPoint's presenter
 * view and under File → Print → Notes Pages.
 */
function speak(s, text) {
  s.addNotes(text.trim());
  return s;
}

/**
 * Every slide, by its title.
 *
 * Notes are attached at the END of this script rather than inline in each
 * block: threading a call through thirty-odd blocks is easy to get wrong and
 * hard to read, and a note that silently fails to attach is worse than none.
 */
const BY_TITLE = new Map();

/** Attach the notes written at the bottom of this file. */
function applyNotes(notes) {
  const missing = [];
  for (const [title, text] of Object.entries(notes)) {
    const s = BY_TITLE.get(title);
    if (!s) {
      missing.push(title);
      continue;
    }
    speak(s, text);
  }
  return missing;
}

/** Content-slide header: kicker + title + accent rule. */
function head(s, title, kicker) {
  BY_TITLE.set(title, s);
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: 0.7, y: 0.5, w: 12, h: 0.3, fontFace: "Arial",
      fontSize: 12, bold: true, color: RED, charSpacing: 2,
    });
  }
  s.addText(title, {
    x: 0.7, y: kicker ? 0.82 : 0.6, w: 12, h: 0.7, fontFace: "Arial",
    fontSize: 30, bold: true, color: WHITE, fit: "shrink",
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0.72, y: kicker ? 1.55 : 1.35, w: 0.7, h: 0.05, fill: { color: RED },
  });
}

/**
 * A framed screenshot that FILLS its frame.
 *
 * Pass x, y and the target width w; the height is derived from the real image
 * aspect so the picture fills the frame edge-to-edge. Returns the drawn image
 * height so callers can place things beneath it.
 */
function picture(s, file, { x, y, w }, caption) {
  const p = shot(file);
  const h = w / ASPECT;
  // Frame sits exactly around the image (a hair larger), so there is never a
  // visible empty band — the picture covers the panel completely.
  s.addShape(pptx.ShapeType.roundRect, {
    x: x - 0.035, y: y - 0.035, w: w + 0.07, h: h + 0.07,
    fill: { color: PANEL }, line: { color: LINE, width: 1 }, rectRadius: 0.05,
  });
  if (p) {
    s.addImage({ path: p, x, y, w, h });
  } else {
    s.addText(`[ ${caption ?? file} ]`, {
      x, y: y + h / 2 - 0.2, w, h: 0.4, align: "center", fontSize: 12, color: MUTE, italic: true,
    });
  }
  if (caption) {
    s.addText(caption, {
      x, y: y + h + 0.07, w, h: 0.3, align: "center", fontSize: 11, color: MUTE, italic: true, fit: "shrink",
    });
  }
  return h;
}

/** Bullet list block. */
function bullets(s, items, box, opts = {}) {
  s.addText(
    items.map((t) => ({
      text: t,
      options: { bullet: { code: "2022", indent: 14 }, color: opts.color ?? BODY, fontSize: opts.fontSize ?? 13, paraSpaceAfter: opts.gap ?? 7, breakLine: true },
    })),
    { x: box.x, y: box.y, w: box.w, h: box.h, valign: "top", fontFace: "Arial", fit: "shrink" },
  );
}

/** A body paragraph with shrink-to-fit. */
function para(s, text, box, opts = {}) {
  s.addText(text, {
    x: box.x, y: box.y, w: box.w, h: box.h, valign: opts.valign ?? "top",
    fontSize: opts.fontSize ?? 13, color: opts.color ?? BODY, bold: opts.bold,
    lineSpacingMultiple: opts.lineSpacingMultiple ?? 1.2, fontFace: "Arial", fit: "shrink",
    align: opts.align,
  });
}

/* ═══════════════════════════════════════════════════════════ 1. TITLE */
{
  const s = slide(BG);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: H, fill: { color: REDDEEP } });
  s.addShape(pptx.ShapeType.rect, { x: 0.22, y: 0, w: 0.06, h: H, fill: { color: BLUR } });

  s.addText(
    [
      { text: "Arise", options: { color: WHITE, bold: true } },
      { text: "Hub", options: { color: RED, bold: true } },
    ],
    { x: 0.9, y: 2.3, w: 11.5, h: 1.2, fontSize: 60, fontFace: "Arial" },
  );
  s.addText("Leadership Presentation", {
    x: 0.95, y: 3.5, w: 11, h: 0.6, fontSize: 26, color: BODY, fontFace: "Arial",
  });
  s.addText("One platform for people, children's check-in, services, communication — and the church's IT.", {
    x: 0.95, y: 4.25, w: 10.8, h: 0.8, fontSize: 15, color: MUTE, fontFace: "Arial", fit: "shrink",
  });
  s.addText("Arise Church  ·  Pineville & Alexandria, Louisiana", {
    x: 0.95, y: 6.4, w: 11, h: 0.4, fontSize: 13, color: MUTE, bold: true, fontFace: "Arial",
  });
}

/* ═══════════════════════════════════════════════════════ 2. WHAT IT IS */
{
  const s = slide(BG);
  head(s, "What AriseHub is", "Overview");
  para(
    s,
    "A single, church-owned platform that runs the ministry and the technology side by side — every member, " +
      "every child checked in, every rota, every conversation, and every IT ticket, in one login, on any device, " +
      "built specifically for how Arise runs a Sunday.",
    { x: 0.7, y: 1.8, w: 11.9, h: 1.05 },
    { fontSize: 16, color: BODY, lineSpacingMultiple: 1.25 },
  );

  const cards = [
    ["People & membership", "Directory, roles, titles, campuses, self-registration"],
    ["Children's check-in", "Pickup verification, allergy safety, name-tag printing"],
    ["Services & scheduling", "Plans, songs, rotas, availability, accept / decline"],
    ["Communication", "Department chats, DMs, push notifications, IT help"],
    ["Groups & events", "Small groups, attendance, calendar, room booking"],
    ["IT operations", "Helpdesk, assets, licenses, Wi-Fi & password vault"],
  ];
  const colW = 3.78;
  const gap = 0.28;
  cards.forEach((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.7 + col * (colW + gap);
    const y = 3.2 + row * 1.72;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: colW, h: 1.52, fill: { color: PANEL }, line: { color: LINE, width: 1 }, rectRadius: 0.06 });
    s.addShape(pptx.ShapeType.rect, { x, y: y + 0.18, w: 0.06, h: 1.16, fill: { color: i === 5 ? BLUR : RED } });
    s.addText(c[0], { x: x + 0.24, y: y + 0.2, w: colW - 0.42, h: 0.35, fontSize: 14, bold: true, color: WHITE, fontFace: "Arial", fit: "shrink" });
    s.addText(c[1], { x: x + 0.24, y: y + 0.58, w: colW - 0.42, h: 0.82, fontSize: 11.5, color: MUTE, fontFace: "Arial", lineSpacingMultiple: 1.12, fit: "shrink" });
  });
}

/* ═══════════════════════════════════════════ 3. WHY BUILT NOT BOUGHT */
{
  const s = slide(BG);
  head(s, "Why we built it, rather than bought it", "The decision");
  bullets(
    s,
    [
      "It fits how Arise actually runs — not how a vendor assumes every church runs.",
      "Ministry AND IT in one place. No other church platform manages help-desk tickets, assets, and passwords.",
      "No per-person, per-module, or per-campus fees — the cost doesn't grow as the church grows.",
      "We own the data outright, in our own database, with full export at any time.",
      "Changes ship the same day they're asked for, because we maintain it ourselves.",
    ],
    { x: 0.7, y: 1.95, w: 7.5, h: 4.4 },
    { fontSize: 15, gap: 12 },
  );
  s.addShape(pptx.ShapeType.roundRect, { x: 8.55, y: 1.95, w: 4.08, h: 3.5, fill: { color: PANEL }, line: { color: BLUR, width: 1 }, rectRadius: 0.08 });
  s.addText("The trade we made", { x: 8.8, y: 2.15, w: 3.6, h: 0.35, fontSize: 14, bold: true, color: BLUR, fontFace: "Arial" });
  para(
    s,
    "Planning Center and Elvanto are companies with support teams and a decade of polish. AriseHub is ours. " +
      "We accept a younger product and in-house support in exchange for fit, ownership, and zero recurring cost. " +
      "This deck is honest about both sides.",
    { x: 8.8, y: 2.6, w: 3.6, h: 2.7 },
    { fontSize: 12.5, color: BODY, lineSpacingMultiple: 1.25 },
  );
}

/* ═══════════════════════════════════════════════ 4. THE DASHBOARD */
{
  const s = slide(BG);
  head(s, "One home for the whole weekend", "The dashboard");
  picture(s, "dashboard-grid.png", { x: 0.7, y: 1.85, w: 5.8 }, "Simple view — every module a tap away");
  picture(s, "dashboard-detailed.png", { x: 6.83, y: 1.85, w: 5.8 }, "Detailed view — the weekend at a glance");
  bullets(
    s,
    [
      "The next service and how staffed it is, at a glance.",
      "Volunteers confirmed, open responses, checked-in today, open IT tickets.",
      "Recent messages across every department chat.",
      "Everything one tap away — dark or light, phone or desktop.",
    ],
    // Below the two screenshots now, not beside them: the pair spans the full
    // width, and a column here would sit on top of the right-hand image.
    { x: 0.7, y: 5.5, w: 11.9, h: 1.6 },
    { fontSize: 13, gap: 7 },
  );
}

/* ═══════════════ SECTION DIVIDER — designed so it reads as finished */
function section(title, subtitle, num) {
  const s = slide(BG);
  BY_TITLE.set(title, s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: H, fill: { color: REDDEEP } });
  s.addShape(pptx.ShapeType.rect, { x: 0.22, y: 0, w: 0.06, h: H, fill: { color: BLUR } });
  // Big ghosted section number, a watermark just above the background.
  s.addText(num, { x: 8.1, y: 0.9, w: 4.5, h: 5.7, fontSize: 300, bold: true, color: GHOST, align: "right", valign: "middle", fontFace: "Arial" });
  // Kicker, then a short accent rule ABOVE the title, then the title. Putting the
  // rule above the title (not under it) means it can never land on the title's
  // letters, whatever the title's length or line count.
  s.addText(`SECTION ${num}`, { x: 0.95, y: 2.35, w: 9, h: 0.35, fontSize: 13, bold: true, color: RED, charSpacing: 3, fontFace: "Arial" });
  s.addShape(pptx.ShapeType.rect, { x: 0.97, y: 2.8, w: 0.72, h: 0.045, fill: { color: RED } });
  s.addText(title, { x: 0.9, y: 2.98, w: 8.6, h: 1.35, fontSize: 38, bold: true, color: WHITE, valign: "top", fontFace: "Arial", fit: "shrink" });
  // Subtitle follows the title: lower when the title wraps to two lines.
  const subY = title.length > 28 ? 4.45 : 3.85;
  s.addText(subtitle, { x: 0.95, y: subY, w: 8.4, h: 0.7, fontSize: 18, color: BODY, valign: "top", fontFace: "Arial", fit: "shrink" });
  return s;
}

/* ═══════════════════════════════ SECTION: CHILDREN'S CHECK-IN */
section("Children's check-in & safeguarding", "The most important thing the platform does", "1");

{
  const s = slide(BG);
  head(s, "A staffed check-in station", "Check-in");
  picture(s, "checkin.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "Find a child, auto-assign the right classroom by age.",
      "A unique pickup code per child; a live badge preview.",
      "Allergy flag surfaces on the tag automatically.",
      "Register a whole family at once; occupancy at a glance.",
      "Works offline — check-ins queue and sync when Wi-Fi returns.",
    ],
    { x: 9.4, y: 2.05, w: 3.3, h: 4.5 },
    { fontSize: 13, gap: 12 },
  );
}

{
  const s = slide(BG);
  head(s, "Self-service kiosk & a real name-tag designer", "Check-in");
  picture(s, "kiosk.png", { x: 0.7, y: 1.85, w: 5.8 }, "Locked-down parent kiosk");
  picture(s, "designer.png", { x: 6.83, y: 1.85, w: 5.8 }, "Drag-and-drop badge designer");
  bullets(
    s,
    [
      "Kiosk mode: a locked two-button screen a parent can use unattended, with an exit PIN.",
      "Design your own tag — fonts, logo, colours, merge fields, allergy details, QR / barcode — printed to a DYMO.",
      "Badges print automatically at the printer station as tablets check children in.",
    ],
    { x: 0.7, y: 5.5, w: 11.9, h: 1.7 },
    { fontSize: 13, gap: 7 },
  );
}

{
  const s = slide(BG);
  head(s, "Safeguarding is built in, not bolted on", "Check-in · Security");
  picture(s, "admincheckin.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "Release verification: the station names who collected each child, or records why.",
      "Tablet lockdown with an exit PIN keeps a lobby device on the check-in page.",
      "Allergy details print on the badge — the volunteer holding a snack box can read it.",
      "Auto-checkout so the roster stays an honest headcount.",
    ],
    { x: 9.4, y: 2.05, w: 3.3, h: 4.5 },
    { fontSize: 12.5, gap: 12 },
  );
}

/* ═══════════════════════════════ SECTION: SERVICES */
section("Services & scheduling", "Plan the service, build the rota, know who's confirmed", "2");

{
  const s = slide(BG);
  head(s, "Plan the service", "Services");
  picture(s, "serviceplan.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "Order of service with a running clock and item lengths.",
      "Songs with their keys, pulled from a reusable library.",
      "Positions filled vs open, and who has confirmed.",
      "Duplicate a plan to next week, keeping people or not.",
    ],
    { x: 9.4, y: 2.15, w: 3.3, h: 4.2 },
    { fontSize: 13, gap: 13 },
  );
}

{
  const s = slide(BG);
  head(s, "Schedule volunteers", "Services");
  picture(s, "scheduling.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "A month / week calendar of the whole rota — or a person-by-date view.",
      "See availability and blockouts before you ask someone.",
      "Volunteers accept or decline and get a push notification.",
      "A team lead can build their own schedule without full admin.",
    ],
    { x: 9.4, y: 2.15, w: 3.3, h: 4.2 },
    { fontSize: 13, gap: 13 },
  );
}

/* ═══════════════════════════════ SECTION: PEOPLE & COMMS */
section("People & communication", "Know your people; reach them where they are", "3");

{
  const s = slide(BG);
  head(s, "The people directory", "People");
  picture(s, "people.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "Every member, with roles, titles, departments and campus.",
      "Search and filter; contact details gated by role.",
      "Self-registration by invite link, email-verified.",
      "Optional two-way Elvanto sync.",
    ],
    { x: 9.4, y: 2.15, w: 3.3, h: 4.2 },
    { fontSize: 13, gap: 13 },
  );
}

{
  const s = slide(BG);
  head(s, "Department chats, DMs & IT help", "Communication");
  picture(s, "messages.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "A chat per department, plus direct messages.",
      "A private thread to IT that becomes a support ticket.",
      "Attachments, with access that ends when someone leaves.",
      "Push notifications to iPhone, iPad and Android — reliably.",
    ],
    { x: 9.4, y: 2.15, w: 3.3, h: 4.2 },
    { fontSize: 13, gap: 13 },
  );
}

{
  const s = slide(BG);
  head(s, "Notifications that actually arrive", "Communication · Reliability");
  picture(s, "notifications.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "Per-device delivery status — you can see who received.",
      "A one-tap 'test everyone' broadcast to confirm the whole team.",
      "Apple push is relayed so iOS devices receive dependably.",
      "Dead registrations are pruned automatically.",
    ],
    { x: 9.4, y: 2.05, w: 3.3, h: 4.5 },
    { fontSize: 12.5, gap: 12 },
  );
}

/* ═══════════════════════════════ SECTION: GROUPS/CALENDAR/FORMS */
section("Groups, calendar & forms", "The rest of church life", "4");

{
  const s = slide(BG);
  head(s, "Small groups & the calendar", "Groups · Calendar");
  picture(s, "groups.png", { x: 0.7, y: 1.85, w: 5.8 }, "Small groups & attendance");
  picture(s, "calendar.png", { x: 6.83, y: 1.85, w: 5.8 }, "Church calendar & room booking");
  bullets(
    s,
    [
      "Small groups with membership and per-meeting attendance.",
      "A church calendar with event requests, approvals, and room booking that refuses double-bookings.",
    ],
    { x: 0.7, y: 5.5, w: 11.9, h: 1.3 },
    { fontSize: 13, gap: 8 },
  );
}

{
  const s = slide(BG);
  head(s, "Forms — no login required for guests", "Forms");
  picture(s, "forms.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "Build a form; share a public link.",
      "Guests fill it in with no account.",
      "Responses land in AriseHub, protected by a bot check.",
      "Active / closed control per form.",
    ],
    { x: 9.4, y: 2.15, w: 3.3, h: 4.2 },
    { fontSize: 13, gap: 13 },
  );
}

/* ═══════════════════════════════ SECTION: IT OPS (differentiator) */
section("IT operations", "The thing no church platform has", "5");

{
  const s = slide(BG);
  head(s, "A full IT help-desk, inside the church platform", "AriseIT");
  picture(s, "it.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "Support tickets, raised from chat or a form.",
      "Asset tracking, software licenses, consumables.",
      "A Wi-Fi & password vault for the church's systems.",
      "Warranty, maintenance and license renewal reminders.",
      "Status emails to whoever raised the request.",
    ],
    { x: 9.4, y: 2.0, w: 3.3, h: 4.0 },
    { fontSize: 12.5, gap: 11 },
  );
  s.addText("Planning Center and Elvanto do none of this.", {
    x: 9.4, y: 6.25, w: 3.35, h: 0.5, fontSize: 12, bold: true, italic: true, color: RED, fontFace: "Arial", fit: "shrink",
  });
}

/* ═══════════════════════════════ SECTION: ADMIN & INSIGHT */
section("Administration & insight", "Configure the church; see how it's doing", "6");

{
  const s = slide(BG);
  head(s, "Reporting across every module", "Reports");
  picture(s, "reports.png", { x: 0.7, y: 1.85, w: 8.4 });
  bullets(
    s,
    [
      "A church-wide snapshot: people, groups, tasks, plans, forms.",
      "Check-in and new-people trends over the last 8 weeks.",
      "Breakdowns by role and by campus.",
      "Every number links back to where it came from.",
    ],
    { x: 9.4, y: 2.15, w: 3.3, h: 4.2 },
    { fontSize: 13, gap: 13 },
  );
}

{
  const s = slide(BG);
  head(s, "Admin & the audit trail", "Administration · Security");
  picture(s, "admindepartments.png", { x: 0.7, y: 1.85, w: 5.8 }, "Departments, rooms, titles, campuses…");
  picture(s, "adminaudit.png", { x: 6.83, y: 1.85, w: 5.8 }, "Every privileged action is logged");
  bullets(
    s,
    [
      "Nine admin areas: departments, people, rooms, check-in, campuses, titles, custom fields, Elvanto, and the audit log.",
      "Every guardian change, role change and pickup override is recorded — an immutable trail for a children's system.",
    ],
    { x: 0.7, y: 5.5, w: 11.9, h: 1.3 },
    { fontSize: 12.5, gap: 8 },
  );
}

{
  const s = slide(BG);
  head(s, "Tasks & ideas", "Coordination");
  picture(s, "tasks.png", { x: 0.7, y: 1.85, w: 5.8 }, "Task assignments");
  picture(s, "ideas.png", { x: 6.83, y: 1.85, w: 5.8 }, "Idea board with voting");
  bullets(
    s,
    [
      "Assign and track work across the team.",
      "An idea board the whole church can contribute to and vote on.",
    ],
    { x: 0.7, y: 5.5, w: 11.9, h: 1.1 },
    { fontSize: 13, gap: 8 },
  );
}

/* ═══════════════════════════════ SECTION: BIBLE & ARCHIVE */
section("The Bible and the archive", "Study during the week; catch up on any Sunday", "7");

/** A grid of titled cards — used where there is no screenshot to show. */
function cardGrid(s, items, opts = {}) {
  const cols = opts.cols ?? 2;
  // One column is the narrow stack that sits beside a screenshot; two and three
  // fill the slide on their own.
  const w = opts.w ?? (cols === 1 ? 5.1 : cols === 2 ? 5.9 : 3.85);
  const gap = 0.35;
  const startX = opts.x ?? 0.7;
  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (w + gap);
    const y = (opts.y ?? 1.85) + row * (opts.h ?? 1.62);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h: (opts.h ?? 1.62) - 0.16,
      fill: { color: PANEL },
      line: { color: opts.accent ?? LINE, width: 1 },
      rectRadius: 0.06,
    });
    s.addText(it[0], {
      x: x + 0.22, y: y + 0.14, w: w - 0.44, h: 0.35,
      fontSize: 13, bold: true, color: opts.titleColor ?? WHITE, fontFace: "Arial", fit: "shrink",
    });
    s.addText(it[1], {
      x: x + 0.22, y: y + 0.52, w: w - 0.44, h: (opts.h ?? 1.62) - 0.74,
      fontSize: 10.5, color: BODY, lineSpacingMultiple: 1.1, fontFace: "Arial", fit: "shrink",
    });
  });
}

{
  const s = slide(BG);
  head(s, "A Bible built into the app", "Bible");
  picture(s, "bible.png", { x: 0.7, y: 1.85, w: 6.4 }, "The reader, on any phone");
  cardGrid(s, [
    ["Every translation in one list", "Six sources behind one menu — the licensed modern translations the church already reads, plus the classics. You pick a Bible, not a provider."],
    ["Study notes on any translation", "The scholarly footnotes that usually only come with one Bible are shown alongside whichever you're reading, and labelled where they came from."],
    ["Read it aloud", "Narrated chapters for the Bibles that publish them — for the car, or for anyone who finds reading hard."],
    ["Plain language on demand", "A 'Simplify' button restates a passage in everyday English, always shown beside the real verse and never presented as scripture."],
  ], { cols: 1, x: 7.4, w: 5.2, y: 1.85, h: 1.28 });
  speak(s, `
This is new since you last saw AriseHub. It is a full Bible, in the app, on everyone's phone.

The thing worth stressing: we are not showing one translation. Six different sources sit behind a single menu, including the licensed modern translations through our own YouVersion account — so it is legal, and it is the wording people actually read.

Two touches I would point at. First, study notes: normally those come with one particular Bible. We show them next to whatever you're reading, and we say where they came from, so nobody mistakes a footnote for scripture. Second, Simplify — it puts a passage into plain English for anyone who finds the older wording hard going. It always sits beside the real verse, clearly marked as an explanation, never as the Bible itself. That line matters and we hold it firmly.

If someone asks about cost: nothing. The free sources are public domain, and the licensed ones come through our own key.`);
}

{
  const s = slide(BG);
  head(s, "Every service, kept", "Sermon archive");
  picture(s, "sermon-detail.png", { x: 0.7, y: 1.85, w: 6.4 }, "A service being archived");
  cardGrid(s, [
    ["Searchable by anything", "Date, speaker, series or scripture — and the words of the message itself, once a transcript is uploaded."],
    ["The video, in the app", "Links the YouTube upload we already make. No second video library to maintain."],
    ["Transcript that jumps", "Tap any line and the video moves to the moment it was said. Search inside a message for the bit you half-remember."],
    ["Slides become a download", "The Proclaim export is trimmed to the message and turned into a PowerPoint people can view in the app or download."],
  ], { cols: 1, x: 7.4, w: 5.2, y: 1.85, h: 1.28 });
  speak(s, `
The archive answers a question we get constantly: "where's that message about…?"

Everything is searchable — date, speaker, series, scripture. And once we upload the captions file, the words of the sermon themselves become searchable. Somebody can find the two minutes they were thinking of, not just the right Sunday.

The transcript is clickable. Tap a line and the video jumps to that moment. That is the piece people react to.

We also take the Proclaim slides. You print the presentation to PDF as usual, upload it, and pick the pages that were actually the message — the countdown and announcements stay out. It becomes a PowerPoint anyone can view in the app or download.

One honest note: this is built and working, but it has not yet run against a real Sunday's files. That is the next thing to try, not something to promise from the platform today.`);
}

/* ═══════════════════════════════ SECTION: CARE & UPKEEP */
section("Looking after people and the building", "The quiet work between Sundays", "8");

{
  const s = slide(BG);
  head(s, "Nobody slips through", "Follow-up & prayer");
  // The directory is the data underneath follow-up, so this screenshot is
  // honestly related rather than decoration.
  picture(s, "followup.png", { x: 0.7, y: 1.85, w: 6.4 }, "The follow-up board");
  cardGrid(
    s,
    [
      ["A real follow-up pipeline", "First visit → contacted → in a group → serving → member, with a name against every stage."],
      ["It nags when things stall", "A card sitting too long in one stage is pulled to the top — the quiet ones are the ones that get missed."],
      ["“We haven't seen them”", "Each week it flags people who attended regularly and stopped. One tap makes it someone's job."],
      ["Prayer requests", "Anyone can ask; it goes to the prayer team and nobody else. Sharing wider is a deliberate choice."],
    ],
    { cols: 1, x: 7.4, w: 5.2, y: 1.85, h: 1.28 },
  );
  speak(s, `
This is the part most church software leaves half-done. Planning Center and Elvanto will tell you a guest visited. They will not tell you who is calling them on Tuesday.

The pipeline has a person's name at every stage, and it pushes stalled cards to the top — because the ones that go quiet are precisely the ones that get forgotten.

The drop-off alert is the piece I would highlight. Every week it looks at who attended regularly and has stopped, and flags them. That is the family that used to be here every Sunday and quietly hasn't been for a month. One tap and it becomes a follow-up with someone responsible.

Prayer requests are deliberately simple: they go to the prayer team and nobody else. Staff do not get blanket access — a prayer request is not administrative data. Sharing more widely is a choice the person makes, and it is off by default.`);
}

{
  const s = slide(BG);
  head(s, "Sunday runs on paper and people", "Services & upkeep");
  // The service plan is where the notes and the run sheet actually live, so
  // this is the screen these four things hang off.
  picture(s, "serviceplan.png", { x: 0.7, y: 1.85, w: 6.4 }, "The plan these all hang off");
  cardGrid(
    s,
    [
      ["Notes to the Media team", "Ministers write what they want on screen; Media mark it into Proclaim. The deadline nudges, never locks."],
      ["Printable run sheet", "The order of service and who's on, laid out for the desk and the stage — not just for staff."],
      ["Announcements with approval", "Leaders ask, an approver decides; approved ones reach the app and the weekend slide list."],
      ["Maintenance requests", "Three fields and a photo. It lands in the maintenance team's chat and on their phones."],
    ],
    { cols: 1, x: 7.4, w: 5.2, y: 1.85, h: 1.28 },
  );
  speak(s, `
Four small things that take real friction out of a week.

Service notes: the minister writes what they want on screen, and Media see it in one place instead of chasing texts on Saturday night. Deliberately, the deadline never locks anything — if something comes to you last minute it still goes through; it is just flagged so Media notice rather than discover it Sunday morning.

The run sheet prints. That sounds trivial until you are at the sound desk with a phone that keeps sleeping.

Maintenance is the newest. Bradly's own point shaped it: people usually just tell the maintenance team directly at church. So the form is three fields and a photo, and there is a "someone told me about this" option — so when a volunteer mentions the broken door, whoever was told can log it in twenty seconds instead of it evaporating. It arrives in the maintenance team's chat and on their phones, where they already talk.

For that one to work, the maintenance people do need to be added to the Maintenance department in the app. That is a two-minute job and worth mentioning.`);
}

/* ═══════════════════════════════════════ EVERY FEATURE (matrix) */
{
  const s = slide(BG);
  head(s, "Everything in one platform", "The full feature list");
  const columns = [
    [
      ["Children's check-in", ["Staffed desk + kiosk mode", "Guardian pickup codes", "Pickup verification", "Allergy flags + details", "Age-based room assignment", "Name-tag designer", "DYMO + network printing", "Auto-print new check-ins", "Offline check-in queue", "Tablet lockdown + PIN", "Auto-checkout rules", "Family registration"]],
      ["Services & scheduling", ["Service plans + running clock", "Song library with keys", "Volunteer scheduling", "Calendar & by-person views", "Availability & blockouts", "Accept / decline + notify", "Printable run sheet", "Notes handoff to Media"]],
    ],
    [
      ["People & membership", ["Church directory", "Roles & title hierarchy", "Departments & campuses", "Invite-link self-registration", "Email-verified onboarding", "Elvanto sync", "Custom fields", "Follow-up pipeline", "Drop-off alerts"]],
      ["Communication", ["Department group chats", "Direct messages", "IT support threads", "Attachments (access-revoking)", "Web push (iOS relay)", "Per-device delivery status", "Announcements + approval", "Prayer requests"]],
    ],
    [
      ["Bible & sermon archive", ["Bible reader, 6 sources", "Licensed translations", "Study notes on any Bible", "Narrated audio", "Plain-language Simplify", "Searchable sermon archive", "Slides → PowerPoint", "Transcript with video sync"]],
      ["Operations & platform", ["IT ticketing (helpdesk)", "Maintenance requests", "Asset & license tracking", "Wi-Fi & password vault", "Audit log", "Row-level security throughout", "Simple or detailed dashboard", "Self-hosted, own the data"]],
    ],
  ];
  const colW = 3.95;
  const gap = 0.25;
  const startX = 0.7;
  const ITEM = 0.225;
  columns.forEach((sections, ci) => {
    const x = startX + ci * (colW + gap);
    let y = 1.72;
    sections.forEach(([title, items]) => {
      s.addText(title, { x, y, w: colW, h: 0.3, fontSize: 12.5, bold: true, color: RED, fontFace: "Arial" });
      y += 0.34;
      s.addText(
        items.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 10 }, color: BODY, fontSize: 9.5, paraSpaceAfter: 2.5, breakLine: true } })),
        { x, y, w: colW, h: items.length * ITEM, valign: "top", fontFace: "Arial" },
      );
      y += items.length * ITEM + 0.22;
    });
  });
}

/* ═══════════════════════════════════════════════════ SECURITY */
{
  const s = slide(BG);
  head(s, "Security — because it holds children's records", "Security");
  const items = [
    ["Row-level security on every table", "The database itself enforces who can see what — not just the app. A volunteer's request for a record they may not see returns nothing, even if the interface is bypassed."],
    ["A real role hierarchy", "Super Admin, Admin (Apostle / Pastor), IT Admin, Staff, Department Head, Volunteer, Member — each sees exactly their scope. Departments further limit what's visible."],
    ["Children's data is gated tightest", "Dates of birth, allergy details and medical notes are revoked church-wide and re-exposed only to the check-in role, through a locked column view."],
    ["An immutable audit log", "Every guardian change, role change, pickup override and privileged reset is recorded with who and when."],
    ["Verified, not assumed", "217 automated tests across 69 database migrations — including 99 that sign in as each role and prove the access boundaries actually hold."],
    ["We own the data", "Our own Postgres database, full export any time, no third party holding it hostage."],
  ];
  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 6.15;
    const y = 1.8 + row * 1.68;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.9, h: 1.52, fill: { color: PANEL }, line: { color: LINE, width: 1 }, rectRadius: 0.06 });
    s.addText(it[0], { x: x + 0.22, y: y + 0.14, w: 5.5, h: 0.35, fontSize: 13, bold: true, color: WHITE, fontFace: "Arial", fit: "shrink" });
    s.addText(it[1], { x: x + 0.22, y: y + 0.52, w: 5.5, h: 0.92, fontSize: 10.5, color: BODY, lineSpacingMultiple: 1.1, fontFace: "Arial", fit: "shrink" });
  });
}

/* ═══════════════════════════════════════════════ COMPARISON */
{
  const s = slide(BG);
  head(s, "AriseHub vs Planning Center vs Elvanto", "Comparison");
  const T = (t, o = {}) => ({ text: t, options: { fontSize: 10, color: BODY, valign: "middle", fontFace: "Arial", ...o } });
  const Hd = (t) => ({ text: t, options: { bold: true, fontSize: 11, color: WHITE, fill: { color: "262A3A" }, valign: "middle", align: "center", fontFace: "Arial" } });
  s.addTable(
    [
      [Hd(""), Hd("AriseHub"), Hd("Planning Center"), Hd("Elvanto / Tithe.ly")],
      [T("Shape", { bold: true, color: WHITE }), T("One app, built for us"), T("Suite of paid modules"), T("One all-in-one system")],
      [T("Monthly cost (our size)", { bold: true, color: WHITE }), T("$0", { color: GOOD, bold: true }), T("~$313"), T("$119 (All Access)")],
      [T("Children's check-in", { bold: true, color: WHITE }), T("Included — pickup, allergy, offline"), T("Strong (paid module)"), T("Included")],
      [T("Service planning", { bold: true, color: WHITE }), T("Plans, songs, rotas"), T("Best in class"), T("Solid")],
      [T("Giving / donations", { bold: true, color: WHITE }), T("Not built", { color: WARN, bold: true }), T("Yes"), T("Yes")],
      [T("IT helpdesk & assets", { bold: true, color: WHITE }), T("Yes — unique", { color: GOOD, bold: true }), T("No"), T("No")],
      [T("Data ownership", { bold: true, color: WHITE }), T("Our own database"), T("Vendor-hosted"), T("Vendor-hosted")],
      [T("Support", { bold: true, color: WHITE }), T("In-house", { color: WARN, bold: true }), T("Vendor team"), T("Vendor team")],
    ],
    { x: 0.7, y: 1.8, w: 11.9, colW: [2.7, 3.2, 3.1, 2.9], rowH: 0.5, border: { pt: 0.5, color: LINE }, fill: { color: BG }, autoPage: false },
  );
  s.addText("Pricing is real: Planning Center is per-module and scales with size ($313 is a quote at our volumes); Elvanto / Tithe.ly All Access is $119/mo. Confirm current figures before presenting.", {
    x: 0.7, y: 6.75, w: 11.9, h: 0.5, fontSize: 9.5, italic: true, color: MUTE, fontFace: "Arial", fit: "shrink",
  });
}

/* ═══════════════════════════════════════════════ PERKS */
{
  const s = slide(BG);
  head(s, "Where AriseHub wins", "Perks");
  const perks = [
    ["Costs nothing", "No per-person, per-module or per-campus fees. $0/mo vs ~$313 (PCO) or $119 (Elvanto) at our size."],
    ["Ministry + IT together", "The only one of the three that also runs the church's help-desk, assets, licenses and passwords."],
    ["Built to fit Arise", "Check-in, roles, departments and the whole flow match how we actually run — not a vendor's template."],
    ["We own everything", "Our database, our data, full export, no lock-in, no vendor deciding our roadmap or pricing."],
    ["Changes ship same-day", "A request on Sunday can be live by Sunday — we maintain it, so there's no support queue to wait in."],
    ["Modern & mobile-first", "Dark or light, installs to any phone or tablet, works offline for check-in."],
  ];
  perks.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 6.15;
    const y = 1.9 + row * 1.62;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.9, h: 1.46, fill: { color: PANEL }, line: { color: GOOD, width: 1 }, rectRadius: 0.06 });
    s.addText(p[0], { x: x + 0.22, y: y + 0.14, w: 5.5, h: 0.35, fontSize: 13, bold: true, color: GOOD, fontFace: "Arial", fit: "shrink" });
    s.addText(p[1], { x: x + 0.22, y: y + 0.52, w: 5.5, h: 0.86, fontSize: 10.5, color: BODY, lineSpacingMultiple: 1.1, fontFace: "Arial", fit: "shrink" });
  });
}

/* ═══════════════════════════════════════════════ DRAWBACKS */
{
  const s = slide(BG);
  head(s, "Where the others win — the honest read", "Drawbacks");
  const cons = [
    ["No giving module", "Planning Center and Elvanto have built-in online giving; AriseHub does not. (Tithe.ly gives away giving free, which closes this at $0 — but it's a second tool.)"],
    ["Support is one team, not a company", "PCO and Elvanto have staffed support desks. AriseHub is supported in-house — fine day-to-day, thinner if that person is away."],
    ["Younger and less battle-tested", "The others have a decade of refinement across thousands of churches. AriseHub is new; the polish and edge-case coverage will keep growing."],
    ["Fewer native mobile apps & integrations", "PCO / Elvanto ship App-Store apps and many third-party integrations. AriseHub is an installable web app and integrates where we build it."],
    ["No large ecosystem", "No marketplace of add-ons, themes, or community plugins."],
    ["The real risk", "Planning Center and Elvanto are companies. AriseHub is us. That's the strength and the risk in one sentence."],
  ];
  cons.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 6.15;
    const y = 1.9 + row * 1.62;
    const isRisk = i === cons.length - 1;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.9, h: 1.46, fill: { color: isRisk ? "241820" : PANEL }, line: { color: isRisk ? RED : WARN, width: 1 }, rectRadius: 0.06 });
    s.addText(c[0], { x: x + 0.22, y: y + 0.14, w: 5.5, h: 0.35, fontSize: 13, bold: true, color: isRisk ? RED : WARN, fontFace: "Arial", fit: "shrink" });
    s.addText(c[1], { x: x + 0.22, y: y + 0.52, w: 5.5, h: 0.86, fontSize: 10, color: BODY, lineSpacingMultiple: 1.08, fontFace: "Arial", fit: "shrink" });
  });
}

/* ═══════════════════════════════════════════════ COST */
{
  const s = slide(BG);
  head(s, "What it costs", "Cost");
  const cards = [
    ["AriseHub + AriseIT", "$0", "per month", "$0 / year", GOOD],
    ["Planning Center", "~$313", "per month, at our sizes", "~$3,756 / year", WHITE],
    ["Elvanto / Tithe.ly", "$119", "per month, All Access", "$1,428 / year", WHITE],
  ];
  cards.forEach((c, i) => {
    const x = 0.7 + i * 4.1;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 2.0, w: 3.85, h: 2.15, fill: { color: i === 0 ? "0F2A1E" : PANEL }, line: { color: i === 0 ? GOOD : LINE, width: i === 0 ? 1.5 : 1 }, rectRadius: 0.08 });
    s.addText(c[0], { x: x + 0.25, y: 2.2, w: 3.4, h: 0.35, fontSize: 13, bold: true, color: WHITE, fontFace: "Arial", fit: "shrink" });
    s.addText(c[1], { x: x + 0.25, y: 2.58, w: 3.4, h: 0.72, fontSize: 34, bold: true, color: c[4], fontFace: "Arial" });
    s.addText(c[2], { x: x + 0.25, y: 3.32, w: 3.4, h: 0.3, fontSize: 11, color: MUTE, fontFace: "Arial", fit: "shrink" });
    s.addText(c[3], { x: x + 0.25, y: 3.66, w: 3.4, h: 0.35, fontSize: 13, bold: true, color: c[4], fontFace: "Arial" });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.7, y: 4.55, w: 11.9, h: 1.55, fill: { color: "241820" }, line: { color: RED, width: 1 }, rectRadius: 0.08 });
  s.addText(
    [
      { text: "The one gap costs nothing to close.  ", options: { bold: true, color: WHITE } },
      { text: "AriseHub has no giving module — and Tithe.ly Giving is free on its own (unlimited donations, the giving app, recurring gifts, year-end tax statements). AriseHub for ministry and IT, Tithe.ly for giving, covers the whole comparison — still at $0/month.", options: { color: BODY } },
    ],
    { x: 0.95, y: 4.75, w: 11.4, h: 1.15, fontSize: 13, lineSpacingMultiple: 1.2, fontFace: "Arial", fit: "shrink" },
  );
}

/* ═══════════════════════════════════════════════ CLOSING */
{
  const s = slide(BG);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: H, fill: { color: REDDEEP } });
  s.addShape(pptx.ShapeType.rect, { x: 0.22, y: 0, w: 0.06, h: H, fill: { color: BLUR } });
  // Registered by hand: this slide builds its own title rather than using
  // head(), so it would otherwise never receive its speaker notes.
  BY_TITLE.set("Where it stands today", s);
  s.addText("Where it stands today", { x: 0.9, y: 1.7, w: 11, h: 0.7, fontSize: 34, bold: true, color: WHITE, fontFace: "Arial" });
  bullets(
    s,
    [
      "Live and in use at arisehub.myfaithtech.com, on phones, tablets and desktops.",
      "Children's check-in, services, communication, groups, forms and IT operations — all working.",
      "Secured by row-level security, a full audit trail, and 217 automated tests.",
      "Owned by Arise, costing nothing to run, and improving continuously.",
      "Still to come: online giving (or Tithe.ly alongside), and whatever real use surfaces.",
    ],
    { x: 0.95, y: 2.6, w: 11.2, h: 3.4 },
    { fontSize: 16, gap: 14 },
  );
  s.addText("AriseHub — built for Arise, owned by Arise.", {
    x: 0.95, y: 6.45, w: 11, h: 0.4, fontSize: 15, bold: true, italic: true, color: RED, fontFace: "Arial",
  });
}

/* ═══════════════════════════════════════════════ SPEAKER NOTES */
// What to SAY, not what is on the slide. These print in presenter view and via
// File → Print → Notes Pages, so nobody has to read the screen aloud.
const missingNotes = applyNotes(NOTES);;

if (missingNotes.length) {
  console.log(`No slide matched these notes: ${missingNotes.join(" | ")}`);
}

const out = path.join(process.cwd(), "AriseHub-Leadership-Presentation.pptx");
await pptx.writeFile({ fileName: out });
const want = [
  "dashboard", "checkin", "kiosk", "designer", "admincheckin", "serviceplan", "scheduling",
  "people", "messages", "notifications", "groups", "calendar", "forms", "it", "reports",
  "admindepartments", "adminaudit", "tasks", "ideas",
].map((n) => `${n}.png`);
const missing = want.filter((f) => !shot(f));
console.log(`Wrote ${out}`);
console.log(missing.length ? `Missing screenshots (placeholders): ${missing.join(", ")}` : "All screenshots embedded.");
