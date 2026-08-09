"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import {
  printNameTag,
  DEFAULT_TAG_OPTIONS,
  type NameTagData,
  type NameTagOptions,
} from "@/lib/nametag";
import {
  getDymoStatus,
  printViaDymo,
  printViaServer,
  printImageViaDymo,
  printImageViaServer,
  printImageViaBrowser,
  agentUrlProblem,
  type DymoStatus,
  type PrintResult,
} from "@/lib/dymo";
import { renderTagToPng, type TagTemplate } from "@/lib/tag-design";
import { TagDesigner } from "./TagDesigner";
import { FamilyRegister } from "./FamilyRegister";
import {
  queueCheckin,
  pendingCount,
  stuckCheckins,
  discardStuck,
  flushQueue,
  isOffline,
  type QueuedCheckin,
} from "@/lib/offline-queue";

export interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  min_age: number | null;
  max_age: number | null;
  active: boolean;
}
export interface PersonRow {
  id: string;
  full_name: string;
  has_allergy: boolean;
  allergy_notes: string | null;
  date_of_birth: string | null;
}
export interface CheckinRow {
  id: string;
  profile_id: string;
  room_id: string | null;
  status: string;
  security_code: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  notes: string | null;
  child: { full_name: string; has_allergy: boolean } | null;
}

// Unambiguous alphabet — no O/0, I/1, S/5, B/8 to avoid mis-reads at pickup.
const CODE_ALPHABET = "ACDEFHJKLMNPRTUVWXY34679";
// Six, not four. Four characters is 331,776 combinations; with ~60 children
// present that is a ~0.5% chance per service that two share a code, and pickup
// matches on code alone. Six is 191 million, which puts a collision beyond any
// realistic Sunday. A unique index over currently-checked-in rows is the
// backstop (migration 0040).
const CODE_LENGTH = 6;
function makeCode() {
  let s = "";
  const buf = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return s;
}

function ageOf(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export function CheckinStation({
  initial,
  rooms,
  people,
  siblings = {},
  currentProfileId,
  campusId,
  isCheckinLead,
  kiosk = false,
}: {
  initial: CheckinRow[];
  rooms: RoomRow[];
  people: PersonRow[];
  /** profile id -> the other people in their household. Optional: /kiosk omits it. */
  siblings?: Record<string, string[]>;
  currentProfileId: string;
  campusId: string | null;
  isCheckinLead: boolean;
  /** Already the locked-down station: don't offer a way back into it. */
  kiosk?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [checkins, setCheckins] = useState<CheckinRow[]>(initial);
  const [tab, setTab] = useState<"checkin" | "roster">("checkin");
  const [q, setQ] = useState("");
  const [claim, setClaim] = useState("");
  // The kiosk opens on a two-button home screen. A parent holding a toddler
  // makes one decision at a time; the staffed desk keeps both panels side by
  // side because a volunteer is doing this fifty times in ten minutes.
  const [kioskView, setKioskView] = useState<"home" | "in" | "out">("home");
  // Church-wide (0066), not per device: two stations disagreeing about how many
  // labels a check-in prints is the kind of thing nobody notices until a roll
  // runs out mid-service. Defaults off until the setting loads.
  const [printGuardianTag, setPrintGuardianTag] = useState(false);
  // Pickup authorisation for the child whose code was just entered.
  const [guardians, setGuardians] = useState<
    { id: string; name: string; canPickup: boolean; notes: string | null }[]
  >([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [releaseTo, setReleaseTo] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  // Defaults to ON: if the setting hasn't loaded yet, ask who is collecting.
  // The failure mode of guessing wrong in the other direction is a child handed
  // to the wrong person.
  const [requirePickup, setRequirePickup] = useState(true);
  // Siblings ticked for the family currently being checked in.
  const [alsoSelected, setAlsoSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBadge, setLastBadge] = useState<
    { name: string; code: string; room: string; hasAllergy: boolean } | null
  >(null);
  const [tagOpts, setTagOpts] = useState<NameTagOptions>(DEFAULT_TAG_OPTIONS);
  const [showTagSettings, setShowTagSettings] = useState(false);

  // Name-tag layout is a per-station preference (which printer/labels they use).
  useEffect(() => {
    const raw = localStorage.getItem("ah-nametag-opts");
    if (raw) {
      try {
        setTagOpts({ ...DEFAULT_TAG_OPTIONS, ...JSON.parse(raw) });
      } catch {}
    }
  }, []);
  function updateTagOpts(patch: Partial<NameTagOptions>) {
    setTagOpts((o) => {
      const next = { ...o, ...patch };
      localStorage.setItem("ah-nametag-opts", JSON.stringify(next));
      return next;
    });
  }

  // DYMO Connect detection. Runs on this device only — the service is local.
  const [dymo, setDymo] = useState<DymoStatus | null>(null);
  const [printer, setPrinter] = useState<string>("");
  // What the last print actually did. Every path used to fail silently, which
  // is the worst possible behaviour when you are standing at the desk on a
  // Sunday morning wondering why nothing came out.
  const [printLog, setPrintLog] = useState<PrintResult[]>([]);
  const [agentUrl, setAgentUrl] = useState("");
  useEffect(() => {
    setAgentUrl(localStorage.getItem("ah-print-server") ?? "");
  }, []);
  const agentProblem = agentUrlProblem(agentUrl);
  useEffect(() => {
    getDymoStatus().then((s) => {
      setDymo(s);
      const saved = localStorage.getItem("ah-dymo-printer");
      setPrinter(saved && s.printers.includes(saved) ? saved : (s.printers[0] ?? ""));
    });
  }, []);

  // Print through DYMO Connect when it's running here; otherwise fall back to
  // the browser print dialog (works on any desktop with the DYMO driver).
  // Designed templates (drag-and-drop designer). When one exists we render it
  // to an image and print that, so the label matches the design exactly.
  const [templates, setTemplates] = useState<TagTemplate[]>([]);
  const [showDesigner, setShowDesigner] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(0);
  // Check-ins that gave up syncing. Kept rather than deleted — an attendance
  // record for a child should not vanish because the network misbehaved.
  const [stuck, setStuck] = useState<QueuedCheckin[]>([]);
  // Staffed-desk presentation only (stat strip + label studio). The ref holds
  // whatever print() last sent out so "Reprint last" always has it; the counter
  // is state because the stat strip displays it. Both are set inside print(),
  // and the re-render the counter causes is what keeps the button's disabled
  // state honest.
  const lastPrintedRef = useRef<NameTagData | null>(null);
  const [labelsPrinted, setLabelsPrinted] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // Check-in must survive flaky WiFi: queue locally, sync when we're back.
  useEffect(() => {
    const refresh = () => {
      setOffline(isOffline());
      setQueued(pendingCount());
    };
    refresh();

    const sync = async () => {
      if (isOffline() || pendingCount() === 0) return refresh();
      const res = await flushQueue(async (row: QueuedCheckin) => {
        const { error } = await supabase.from("checkins").insert({
          profile_id: row.profile_id,
          room_id: row.room_id,
          campus_id: row.campus_id,
          security_code: row.security_code,
          checked_in_at: row.checked_in_at,
          status: row.status,
          // The idempotency key the queue always claimed to send. Without it
          // the unique index has nothing to catch, and a reply lost in flight
          // inserts the child twice.
          local_id: row.localId,
          // Offline rows used to arrive with nobody attributed to them.
          checked_in_by: row.checked_in_by,
        });
        return { error };
      });
      setQueued(pendingCount());
      setStuck(stuckCheckins());
      refresh();
      if (res.synced > 0) router.refresh();
    };

    window.addEventListener("online", sync);
    window.addEventListener("offline", refresh);
    const timer = setInterval(sync, 20000);
    void sync();
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", refresh);
      clearInterval(timer);
    };
  }, [supabase, router]);
  useEffect(() => {
    supabase
      .from("nametag_templates")
      .select("id, name, width_in, height_in, design, is_default, kind")
      .then(({ data }) => setTemplates((data ?? []) as TagTemplate[]));
  }, [supabase]);

  const today = new Date().toISOString().slice(0, 10);

  // Kids' ministry on a Sunday wants pickup verified. A midweek service where
  // the child just leaves with their parents does not. Super_Admin decides in
  // Admin -> Check-in rather than it being a code change.
  useEffect(() => {
    supabase
      .from("checkin_settings")
      .select("require_pickup_verification, print_guardian_tag")
      .maybeSingle()
      .then(({ data }) => {
        const row = data as {
          require_pickup_verification: boolean;
          print_guardian_tag: boolean;
        } | null;
        if (row) {
          setRequirePickup(row.require_pickup_verification);
          setPrintGuardianTag(row.print_guardian_tag);
        }
      });
  }, [supabase]);

  // Print chain: designed template (rendered to an image) if one exists, then
  // DYMO Connect on this machine → the shared desktop print agent (for iPads)
  // → the browser print dialog. First one that works wins.
  async function print(d: NameTagData) {
    // Purely observational — the print chain below is untouched. Remember what
    // went out (for "Reprint last") and that it went out (for the stat strip).
    lastPrintedRef.current = d;
    setLabelsPrinted((n) => n + 1);
    // The church-wide setting wins over whatever this device happens to have in
    // localStorage, so every station prints the same number of labels.
    const opts = { ...tagOpts, showGuardianTag: printGuardianTag };
    const forKind = (kind: "child" | "guardian") =>
      templates.find((t) => t.kind === kind && t.is_default) ??
      templates.find((t) => t.kind === kind);

    const toPrint: TagTemplate[] = [];
    const child = forKind("child");
    if (child) toPrint.push(child);
    if (printGuardianTag) {
      // No guardian template? Print the child design again marked as a guardian
      // tag rather than silently skipping it. A child checked in without a
      // matching claim tag is the failure this whole code system exists to stop.
      const g = forKind("guardian") ?? (child ? { ...child, kind: "guardian" as const } : undefined);
      if (g) toPrint.push(g);
    }

    if (toPrint.length > 0) {
      for (const tpl of toPrint) {
        const png = await renderTagToPng(tpl, {
          name: d.name,
          room: d.room,
          code: d.code,
          church: opts.churchName,
          // The Show-allergy toggle governs designed templates too, not just
          // the built-in layout — one switch, one meaning.
          hasAllergy: opts.showAllergy && d.hasAllergy,
          allergyNotes: d.allergyNotes,
          campus: d.campus,
          guardian: d.guardian,
          service: d.service,
          age: d.age,
          checkedInAt: d.checkedInAt,
        });
        // DYMO Connect here → shared print agent (iPads) → browser dialog.
        const attempts: PrintResult[] = [];
        const direct = await printImageViaDymo(png, tpl.width_in, tpl.height_in, printer || undefined);
        attempts.push(direct);
        if (direct.ok) {
          setPrintLog(attempts);
          continue;
        }
        const agent = localStorage.getItem("ah-print-server");
        if (agent) {
          const viaAgent = await printImageViaServer(png, tpl.width_in, tpl.height_in, agent, printer || undefined);
          attempts.push(viaAgent);
          if (viaAgent.ok) {
            setPrintLog(attempts);
            continue;
          }
        }
        printImageViaBrowser(png, tpl.width_in, tpl.height_in);
        attempts.push({ ok: true, via: "browser" });
        setPrintLog(attempts);
      }
      return;
    }

    // No designed template yet — fall back to the built-in layout.
    const attempts: PrintResult[] = [];
    const direct = await printViaDymo(d, opts, printer || undefined);
    attempts.push(direct);
    if (direct.ok) return setPrintLog(attempts);
    const server = localStorage.getItem("ah-print-server");
    if (server) {
      const viaAgent = await printViaServer(d, opts, server);
      attempts.push(viaAgent);
      if (viaAgent.ok) return setPrintLog(attempts);
    }
    printNameTag(d, opts);
    attempts.push({ ok: true, via: "browser" });
    setPrintLog(attempts);
  }

  const activeRooms = rooms.filter((r) => r.active);
  const present = useMemo(() => checkins.filter((c) => c.status === "checked_in"), [checkins]);

  const occupancy = useMemo(() => {
    const o: Record<string, number> = {};
    for (const c of present) if (c.room_id) o[c.room_id] = (o[c.room_id] ?? 0) + 1;
    return o;
  }, [present]);

  const checkedInIds = useMemo(() => new Set(present.map((c) => c.profile_id)), [present]);

  // ---- Staffed-desk stat strip + label studio. Never rendered in kiosk. ----

  // Fullest room: fill ratio where capacity is known; a room with no capacity
  // set ranks by raw headcount, beneath any known ratio (the /1000 keeps it
  // there). Rooms with children in them beat empty rooms regardless.
  const fillScore = (r: RoomRow) =>
    r.capacity != null && r.capacity > 0
      ? (occupancy[r.id] ?? 0) / r.capacity
      : (occupancy[r.id] ?? 0) / 1000;
  const roomsInUse = activeRooms.filter((r) => (occupancy[r.id] ?? 0) > 0);
  const fullestPool = roomsInUse.length > 0 ? roomsInUse : activeRooms;
  const fullest =
    fullestPool.length > 0
      ? fullestPool.reduce((a, b) => (fillScore(b) > fillScore(a) ? b : a))
      : null;
  const fullestCount = fullest ? (occupancy[fullest.id] ?? 0) : 0;
  const nearCapacity =
    fullest?.capacity != null && fullest.capacity > 0 && fullestCount / fullest.capacity >= 0.85;

  // Label-studio preview: the default child design rendered with PLACEHOLDER
  // values — an idle desk screen must never display a real child's name.
  // Same template choice as print()'s forKind("child"), so the preview shows
  // the design that will actually come out of the printer.
  const previewTemplate =
    templates.find((t) => t.kind === "child" && t.is_default) ??
    templates.find((t) => t.kind === "child") ??
    null;
  const previewRoom = activeRooms[0]?.name ?? "Arise Kids";
  useEffect(() => {
    if (kiosk) return; // the studio never renders there — skip the canvas work
    if (!previewTemplate) {
      setPreviewSrc(null);
      return;
    }
    let live = true;
    renderTagToPng(
      previewTemplate,
      {
        name: "Noah R.",
        room: previewRoom,
        code: "AH-041",
        church: tagOpts.churchName,
        hasAllergy: false,
      },
      150, // small on-screen preview; real labels keep PRINT_DPI
    ).then((png) => {
      if (live) setPreviewSrc(png);
    });
    return () => {
      live = false;
    };
  }, [kiosk, previewTemplate, previewRoom, tagOpts.churchName]);

  const matches = q.trim()
    ? people.filter((p) => p.full_name.toLowerCase().includes(q.toLowerCase())).slice(0, 12)
    : [];

  // Auto-pick the first active room whose age range fits, else the first room.
  function suggestRoom(person: PersonRow): RoomRow | null {
    const age = ageOf(person.date_of_birth);
    if (age != null) {
      const fit = activeRooms.find(
        (r) =>
          (r.min_age == null || age >= r.min_age) && (r.max_age == null || age <= r.max_age),
      );
      if (fit) return fit;
    }
    return activeRooms[0] ?? null;
  }

  /**
   * Check in a whole household in one action.
   *
   * Siblings each get their own room (auto-assigned by age), their own code and
   * their own badge — they are separate check-ins, not one group record. What's
   * shared is the volunteer's single tap, which is the part that was costing
   * time with a queue waiting.
   *
   * Sequential rather than parallel: each check-in prints, and firing three
   * print jobs at once at a DYMO is how you get three labels in the wrong
   * order or one lost.
   */
  async function checkInFamily(primary: PersonRow, primaryRoomId: string, alsoIds: string[]) {
    const others = alsoIds
      .map((id) => people.find((p) => p.id === id))
      .filter((p): p is PersonRow => !!p && !checkedInIds.has(p.id));

    await checkIn(primary, primaryRoomId);
    for (const sib of others) {
      await checkIn(sib, suggestRoom(sib)?.id ?? "");
    }
    setAlsoSelected({});
  }

  async function checkIn(person: PersonRow, roomId: string) {
    // checkins.campus_id is NOT NULL — a station must know which campus it's at.
    if (!campusId) {
      setError(
        "Your profile has no campus set. Ask an admin to assign your campus in Admin → People before checking anyone in.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    const room = rooms.find((r) => r.id === roomId);
    if (room?.capacity != null && (occupancy[roomId] ?? 0) >= room.capacity) {
      if (!window.confirm(`${room.name} is at capacity (${room.capacity}). Check in anyway?`)) {
        setBusy(false);
        return;
      }
    }
    const code = makeCode();
    const nowIso = new Date().toISOString();
    const roomName = rooms.find((r) => r.id === roomId)?.name ?? "";

    // Offline: record locally, print the badge, move the line along.
    if (isOffline()) {
      const saved = queueCheckin({
        localId: crypto.randomUUID(),
        profile_id: person.id,
        room_id: roomId,
        campus_id: campusId,
        security_code: code,
        checked_in_at: nowIso,
        status: "checked_in",
        checked_in_by: currentProfileId,
        childName: person.full_name,
        hasAllergy: person.has_allergy,
        roomName,
      });
      // localStorage failing used to be swallowed while the UI said "saved" —
      // and the badge has already printed, so the child is physically checked
      // in with no record anywhere.
      if (!saved) {
        setError(
          `${person.full_name}'s badge printed, but this device couldn't save the check-in offline (storage full or blocked). Write it down and tell a check-in lead.`,
        );
      }
      setQueued(pendingCount());
      setLastBadge({
        name: person.full_name,
        code,
        room: roomName,
        hasAllergy: person.has_allergy,
      });
      await print({
        name: person.full_name,
        code,
        room: roomName,
        hasAllergy: person.has_allergy,
        allergyNotes: person.allergy_notes ?? undefined,
        checkedInAt: nowIso,
      });
      setBusy(false);
      setQ("");
      return;
    }
    const { data, error } = await supabase
      .from("checkins")
      .insert({
        profile_id: person.id,
        room_id: roomId || null,
        campus_id: campusId,
        security_code: code,
        status: "checked_in",
        checked_in_by: currentProfileId,
      })
      .select("id, profile_id, room_id, status, security_code, checked_in_at, checked_out_at, notes")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCheckins((cs) => [
      { ...(data as CheckinRow), child: { full_name: person.full_name, has_allergy: person.has_allergy } },
      ...cs,
    ]);
    const badge = {
      name: person.full_name,
      code,
      room: room?.name ?? "",
      hasAllergy: person.has_allergy,
      allergyNotes: person.allergy_notes ?? undefined,
    };
    setLastBadge(badge);
    setQ("");
    // Print immediately — this is the moment the volunteer needs the tag.
    print(badge);
  }

  /**
   * Release a child.
   *
   * `releasedTo` is the authorised guardian who collected them. When nobody on
   * the pickup list is present the volunteer must say who took the child and
   * why — that note is the only record it happened, so it is required rather
   * than optional.
   */
  async function checkOut(c: CheckinRow, releasedTo?: string | null, note?: string | null) {
    setError(null);
    const previous = { status: c.status, checked_out_at: c.checked_out_at };
    setCheckins((cs) =>
      cs.map((x) =>
        x.id === c.id
          ? { ...x, status: "checked_out", checked_out_at: new Date().toISOString() }
          : x,
      ),
    );
    const { data, error } = await supabase
      .from("checkins")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: currentProfileId,
        released_to_profile_id: releasedTo ?? null,
        release_note: note?.trim() || null,
      })
      .eq("id", c.id)
      .select("id");
    // The roster is the record of who is still in the building. A release that
    // failed but LOOKS successful means a child is marked gone while they are
    // still in the room — the roster stops being a headcount, and at the end of
    // the morning nobody goes looking for them. `.select("id")` makes the write
    // authoritative: an RLS refusal returns zero rows and a null error, which an
    // unchecked update cannot tell from success.
    if (error || !data?.length) {
      setCheckins((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...previous } : x)));
      setError(
        error?.message ??
          "That check-out didn't save — the child is still shown as present. Try again.",
      );
    }
  }

  // Pickup: match the guardian's claim tag to a present child.
  //
  // Deliberately `filter`, not `find`. If two present children somehow share a
  // code, `find` silently hands over whichever was checked in first — a child
  // released to the wrong adult, with the system showing no sign of a problem.
  // Codes are now 6 characters and a unique index guards active check-ins, so
  // this should be unreachable; if it ever fires, refusing is the right answer.
  const claimQuery = claim.trim().toUpperCase();
  const claimMatches = claimQuery.length >= 3
    ? present.filter((c) => c.security_code?.toUpperCase() === claimQuery)
    : [];
  const claimAmbiguous = claimMatches.length > 1;
  const claimMatch = claimMatches.length === 1 ? claimMatches[0] : undefined;

  // Who is actually allowed to collect this child.
  //
  // `guardians` has carried can_pickup since 0001 — "a grandparent may pick up;
  // a non-custodial parent may not" — and pickup never once read it. Matching
  // the code alone means whoever holds the tag takes the child.
  const claimChildId = claimMatch?.profile_id;
  useEffect(() => {
    if (!claimChildId) {
      setGuardians([]);
      setReleaseTo("");
      setReleaseNote("");
      return;
    }
    let live = true;
    setGuardiansLoading(true);
    (async () => {
      const { data: links } = await supabase
        .from("guardians")
        .select("guardian_profile_id, can_pickup, notes")
        .eq("child_profile_id", claimChildId);
      const rows = (links ?? []) as {
        guardian_profile_id: string;
        can_pickup: boolean;
        notes: string | null;
      }[];
      const ids = rows.map((r) => r.guardian_profile_id);
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (ps ?? []) as { id: string; full_name: string }[]) names[p.id] = p.full_name;
      }
      if (!live) return;
      setGuardians(
        rows.map((r) => ({
          id: r.guardian_profile_id,
          name: names[r.guardian_profile_id] ?? "Unknown person",
          canPickup: r.can_pickup,
          notes: r.notes,
        })),
      );
      setGuardiansLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [claimChildId, supabase]);

  const allowedGuardians = guardians.filter((g) => g.canPickup);
  const blockedGuardians = guardians.filter((g) => !g.canPickup);
  // With verification on, release is permitted either to a named authorised
  // guardian or to somebody else with a written reason — never on the code
  // alone. With it off, the code IS the check.
  const canRelease = !requirePickup || !!releaseTo || releaseNote.trim().length >= 3;

  const leaveKioskView = () => {
    setKioskView("home");
    setQ("");
    setClaim("");
    setReleaseTo("");
  };

  // KIOSK HOME — the whole screen is two targets. No tabs, no roster, no name
  // tag settings: those belong to whoever set the tablet up, not to the parent
  // standing in front of it. The tag design comes from whichever template is
  // marked default, so there is nothing to choose here either.
  if (kiosk && kioskView === "home") {
    return (
      <div className="mx-auto flex min-h-[75vh] max-w-3xl flex-col justify-center px-5 py-8">
        <div className="mb-10 text-center">
          <h1 className="font-display text-4xl font-bold text-ink-900 sm:text-5xl">Welcome</h1>
          <p className="mt-3 text-lg text-ink-500">
            {present.length === 0
              ? "Nobody is checked in yet"
              : `${present.length} checked in right now`}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <button
            onClick={() => setKioskView("in")}
            className="flex min-h-[11rem] flex-col items-center justify-center gap-3 rounded-3xl bg-accent px-6 py-10 text-onaccent shadow-lg transition hover:bg-accent-strong active:scale-[0.98]"
          >
            <Icon name="check" size={44} />
            <span className="font-display text-3xl font-bold">Check in</span>
          </button>
          <button
            onClick={() => setKioskView("out")}
            className="flex min-h-[11rem] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-ink-200 bg-white px-6 py-10 text-ink-900 shadow-sm transition hover:bg-ink-50 active:scale-[0.98]"
          >
            <Icon name="badge" size={44} />
            <span className="font-display text-3xl font-bold">Check out</span>
          </button>
        </div>

        {activeRooms.length === 0 && (
          <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
            No rooms exist yet. Add rooms before running check-in.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {kiosk ? (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={leaveKioskView}
            className="flex items-center gap-1.5 rounded-2xl bg-ink-100 px-5 py-3.5 text-base font-semibold text-ink-700 hover:bg-ink-200 active:scale-[0.98]"
          >
            <span aria-hidden className="text-lg leading-none">←</span> Back
          </button>
          <h1 className="font-display text-2xl font-bold text-ink-900">
            {kioskView === "in" ? "Check in" : "Check out"}
          </h1>
        </div>
      ) : (
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-ink-900">Check-In</h1>
          <p className="mt-1 text-ink-500">
            {present.length} checked in right now
            {activeRooms.length === 0 && " · no rooms set up yet"}
          </p>
        </div>
      )}

      {activeRooms.length === 0 && (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No rooms exist yet. Add rooms (with age ranges and capacity) before running
          check-in, so children get auto-assigned correctly.
        </p>
      )}

      {/* Tabs, the roster and the name tag settings belong to the staffed desk.
          Not rendered rather than hidden: on a kiosk, display:none still leaves
          them reachable by tab key, and the roster is every child's name. */}
      {!kiosk && (
      <div className="mb-5 flex items-center gap-1 border-b border-ink-100">
        <TabBtn active={tab === "checkin"} onClick={() => setTab("checkin")}>Check in / out</TabBtn>
        <TabBtn active={tab === "roster"} onClick={() => setTab("roster")}>Roster ({present.length})</TabBtn>
        <div className="flex-1" />
        {/* A plain anchor, not a router push: /kiosk lives outside the app shell,
            and a hard navigation is what makes "Add to Home Screen" from there
            launch straight into the station with no address bar. */}
        {!kiosk && (
          <a
            href="/kiosk"
            className="mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
          >
            <Icon name="badge" size={16} /> Kiosk mode
          </a>
        )}
        <button
          onClick={() => setShowTagSettings((s) => !s)}
          className="mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
        >
          <Icon name="form" size={16} /> Name tags
        </button>
      </div>
      )}

      {showTagSettings && (
        <div className="mb-5 rounded-xl border border-ink-100 bg-white p-4">
          <h2 className="mb-1 font-display font-semibold text-ink-900">Name tag layout</h2>
          <p className="mb-3 text-xs text-ink-500">
            Prints to a <strong>DYMO LabelWriter</strong> on <strong>30252 Address
            labels</strong> (3.5&quot; × 1.125&quot;). Settings are saved per device.
          </p>

          <div className="mb-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
            <Icon name="form" size={16} className="text-brand-600" />
            <span className="flex-1 text-xs text-ink-700">
              {templates.length > 0
                ? `${templates.length} custom design${templates.length === 1 ? "" : "s"} — used for printing.`
                : "Design your own name tag: drag and drop text, logos, colours and decorations."}
            </span>
            <button
              onClick={() => setShowDesigner(true)}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
            >
              Open designer
            </button>
          </div>

          {/* Printer status — the DYMO service is per-computer, so this reflects
              THIS station only. */}
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-xs ${
              dymo?.available
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {dymo === null ? (
              "Checking for DYMO Connect…"
            ) : dymo.available ? (
              <>
                <strong>DYMO Connect is running.</strong> Labels print straight to the
                printer — no dialog.
                {dymo.printers.length > 1 && (
                  <select
                    className="ah-input mt-2 py-1 text-xs"
                    value={printer}
                    onChange={(e) => {
                      setPrinter(e.target.value);
                      localStorage.setItem("ah-dymo-printer", e.target.value);
                    }}
                  >
                    {dymo.printers.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <>
                <strong>DYMO Connect not detected on this device.</strong>{" "}
                {dymo.reason} Install and run DYMO Connect here, or point this station
                at a print server below. Otherwise the browser print dialog is used.
              </>
            )}
          </div>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium text-ink-600">
              Print server (for iPads / tablets)
            </span>
            <input
              className="ah-input"
              placeholder="https://192.168.1.50:41952"
              defaultValue={agentUrl}
              onChange={(e) => setAgentUrl(e.target.value)}
              onBlur={(e) => localStorage.setItem("ah-print-server", e.target.value.trim())}
            />
            <span className="mt-1 block text-xs text-ink-400">
              Address of the desktop running the print agent with the DYMO on USB.
              Leave blank if this device prints directly.
            </span>
            {/* Says it up front rather than after an hour of debugging a
                "network error" that is actually a browser policy. */}
            {agentProblem && (
              <span className="mt-1 block rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                {agentProblem}
              </span>
            )}
          </label>

          {/* What the last print attempt actually did. */}
          {printLog.length > 0 && (
            <div className="mb-3 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                Last print
              </p>
              <ul className="space-y-0.5 text-xs">
                {printLog.map((a, i) => (
                  <li key={i} className={a.ok ? "text-emerald-700" : "text-brand-700"}>
                    {a.ok ? "✓" : "✕"}{" "}
                    {a.via === "dymo"
                      ? "DYMO Connect on this device"
                      : a.via === "agent"
                        ? "Print agent"
                        : "Browser print dialog"}
                    {a.error ? ` — ${a.error}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-ink-600">Church name on tag</span>
              <input
                className="ah-input"
                value={tagOpts.churchName}
                onChange={(e) => updateTagOpts({ churchName: e.target.value })}
              />
            </label>
            {(
              [
                ["showChurchName", "Show church name"],
                ["showRoom", "Show classroom"],
                ["showCode", "Show pickup code"],
                ["showDate", "Show date"],
                ["showAllergy", "Show allergy flag"],
                // Guardian tag is church-wide now (Admin -> Check-in), not per
                // device — two sources of truth meant nobody knew which won.
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={tagOpts[k] as boolean}
                  onChange={(e) => updateTagOpts({ [k]: e.target.checked } as Partial<NameTagOptions>)}
                />
                {label}
              </label>
            ))}
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink-600">
                Text size ({tagOpts.fontScale.toFixed(2)}×)
              </span>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={tagOpts.fontScale}
                onChange={(e) => updateTagOpts({ fontScale: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          </div>
          <button
            onClick={() =>
              print({ name: "Sample Child", room: "Arise Kids", code: "AB34", hasAllergy: true })
            }
            className="mt-3 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200"
          >
            Print a test label
          </button>
        </div>
      )}

      {error && <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

      {/* Check-ins that stopped syncing. These used to be deleted after five
          attempts with the count returned but never displayed, so a child's
          attendance record disappeared and nobody knew. */}
      {stuck.length > 0 && (
        <div className="mb-4 rounded-xl border-2 border-brand-400 bg-brand-50 p-3">
          <p className="font-display text-sm font-bold text-brand-800">
            {stuck.length} check-in{stuck.length === 1 ? "" : "s"} could not be saved
          </p>
          <p className="mb-2 text-xs text-brand-700">
            These children were checked in on this device and their badges
            printed, but the record never reached the server. Show a check-in
            lead before clearing them.
          </p>
          <ul className="space-y-1">
            {stuck.map((s) => (
              <li key={s.localId} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm">
                <span className="font-medium text-ink-900">{s.childName}</span>
                <span className="font-mono text-xs text-ink-500">{s.security_code}</span>
                <span className="text-xs text-ink-400">{s.roomName}</span>
                <span className="flex-1" />
                <span className="text-xs text-brand-700">{s.lastError}</span>
                <button
                  onClick={() => {
                    discardStuck(s.localId);
                    setStuck(stuckCheckins());
                  }}
                  className="rounded-md bg-ink-100 px-2 py-1 text-xs font-medium text-ink-600 hover:bg-ink-200"
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Badge shown right after check-in — the number the guardian must present */}
      {lastBadge && (
        <div className="mb-5 rounded-xl border-2 border-brand-500 bg-white p-5 text-center">
          <p className="text-xs uppercase tracking-wide text-ink-400">Checked in</p>
          <p className="font-display text-xl font-bold text-ink-900">{lastBadge.name}</p>
          <p className="text-sm text-ink-500">{lastBadge.room}</p>
          <p className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-brand-600">
            {lastBadge.code}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Give this code to the guardian — it&apos;s required for pickup.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              onClick={() => print(lastBadge)}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
            >
              Reprint name tag
            </button>
            <button
              onClick={() => setLastBadge(null)}
              className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Stat strip (handoff screen 7) — the desk's at-a-glance numbers, one
          bordered container with internal dividers. Not rendered in kiosk mode:
          a parent doesn't need occupancy figures or a print counter. */}
      {!kiosk && (
        <div className="mb-5 grid grid-cols-2 rounded-xl border border-ink-100 bg-white sm:grid-cols-4 sm:divide-x sm:divide-ink-100">
          <StatCell
            kicker="Checked in now"
            value={String(present.length)}
            status={present.length === 0 ? "nobody here yet" : "in the building"}
          />
          <StatCell
            kicker="Fullest room"
            value={
              fullest
                ? fullest.capacity != null
                  ? `${fullestCount}/${fullest.capacity}`
                  : String(fullestCount)
                : "—"
            }
            status={
              fullest
                ? nearCapacity
                  ? `${fullest.name} — near capacity`
                  : fullest.name
                : "no rooms yet"
            }
            attention={nearCapacity}
          />
          <StatCell kicker="Labels printed" value={String(labelsPrinted)} status="this session" />
          <StatCell
            kicker="Rooms active"
            value={String(activeRooms.length)}
            status={rooms.length === 0 ? "add rooms in Admin" : `of ${rooms.length} configured`}
            attention={rooms.length === 0}
          />
        </div>
      )}

      {tab === "checkin" ? (
        <div className={kiosk ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
          {/* Check IN */}
          {/* lg:col-span-2. This is a direct child of `lg:grid-cols-2`, so on a
              wide screen it was taking the LEFT column to itself and stretching
              to the full height of the row — pushing check-in into the right
              half and leaving a tall amber slab beside it. It is a banner; it
              spans. */}
          {(offline || queued > 0) && (
            <div
              className={
                "mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm lg:col-span-2 " +
                (offline ? "bg-amber-50 text-amber-800" : "bg-ink-100 text-ink-600")
              }
            >
              <Icon name="help" size={16} />
              <span className="flex-1">
                {offline
                  ? "Offline — check-ins are saved on this device and will sync automatically."
                  : "Syncing " + queued + " check-in" + (queued === 1 ? "" : "s") + "…"}
              </span>
              {queued > 0 && (
                // Explicit colours, not inherited. `bg-white` inverts and
                // amber-800 does not, so the count — the number that decides
                // whether you can hand the tablet over — was dark-brown on
                // near-black in dark mode.
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-semibold " +
                    (offline ? "bg-amber-200 text-amber-900" : "bg-white text-ink-700")
                  }
                >
                  {queued}
                </span>
              )}
            </div>
          )}

          {(!kiosk || kioskView === "in") && (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                Find a child or person
              </h2>
              <button
                onClick={() => setShowFamily(true)}
                className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-200"
              >
                <Icon name="users" size={16} /> Register a family
              </button>
            </div>
            <input
              className="ah-input"
              placeholder="Type a name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="mt-2 space-y-2">
              {matches.map((p) => {
                const already = checkedInIds.has(p.id);
                const suggested = suggestRoom(p);
                const age = ageOf(p.date_of_birth);
                return (
                  <div key={p.id} className="rounded-xl border border-ink-100 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-medium text-ink-900">
                        {p.full_name}
                        {age != null && <span className="ml-1 text-xs text-ink-400">age {age}</span>}
                      </span>
                      {p.has_allergy && (
                        <span
                          className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-onaccent"
                          title="Has an allergy on file — ask a check-in lead for details"
                        >
                          Allergy
                        </span>
                      )}
                    </div>
                    {already ? (
                      // ink-500, not emerald-700: this sits on bg-white, which
                      // inverts, while emerald-700 does not — 3.25:1 in dark.
                      // The green carried no meaning the words did not.
                      <p className="mt-1 text-xs text-ink-500">Already checked in</p>
                    ) : (
                      <>
                        {/* Siblings still to check in. Each still gets their own
                            room, code and badge — what's shared is the tap. */}
                        {(() => {
                          const family = (siblings[p.id] ?? [])
                            .map((id) => people.find((x) => x.id === id))
                            .filter((x): x is PersonRow => !!x && !checkedInIds.has(x.id));
                          if (family.length === 0) return null;
                          return (
                            <div className="mt-2 rounded-lg bg-ink-50 px-2.5 py-2">
                              <p className="mb-1 text-xs font-medium text-ink-500">
                                Same household — check in together?
                              </p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {family.map((s) => (
                                  <label key={s.id} className="flex items-center gap-1.5 text-sm text-ink-700">
                                    <input
                                      type="checkbox"
                                      checked={!!alsoSelected[s.id]}
                                      onChange={(e) =>
                                        setAlsoSelected((a) => ({ ...a, [s.id]: e.target.checked }))
                                      }
                                    />
                                    {s.full_name}
                                    {s.has_allergy && (
                                      <span className="rounded-full bg-accent px-1.5 text-[9px] font-bold uppercase text-onaccent">
                                        allergy
                                      </span>
                                    )}
                                    <span className="text-xs text-ink-400">
                                      {suggestRoom(s)?.name ?? "no room"}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        <div className="mt-2 flex gap-2">
                        <select
                          className="ah-input py-1.5 text-sm"
                          defaultValue={suggested?.id ?? ""}
                          id={`room-${p.id}`}
                        >
                          <option value="">No room</option>
                          {activeRooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                              {r.capacity != null && ` (${occupancy[r.id] ?? 0}/${r.capacity})`}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const sel = document.getElementById(`room-${p.id}`) as HTMLSelectElement | null;
                            const also = (siblings[p.id] ?? []).filter((id) => alsoSelected[id]);
                            checkInFamily(p, sel?.value ?? "", also);
                          }}
                          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
                        >
                          {(() => {
                            const n = 1 + (siblings[p.id] ?? []).filter((id) => alsoSelected[id]).length;
                            return n > 1 ? `Check in ${n}` : "Check in";
                          })()}
                        </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {q.trim() && matches.length === 0 && (
                <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-400">
                  No one found. Add them in Admin → People first.
                </p>
              )}
            </div>
          </section>
          )}

          {/* Check OUT by claim code */}
          {(!kiosk || kioskView === "out") && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Pickup — enter the guardian&apos;s code
            </h2>
            <input
              className="ah-input ah-input-code text-center font-mono tracking-[0.3em] uppercase"
              placeholder="ABCDEF"
              maxLength={CODE_LENGTH}
              value={claim}
              onChange={(e) => setClaim(e.target.value.toUpperCase())}
            />
            {claim.trim().length >= 3 && (
              <div className="mt-3">
                {claimAmbiguous ? (
                  // Refuse rather than guess. Releasing the wrong child is the
                  // one failure this whole code system exists to prevent.
                  <div className="rounded-xl border border-brand-300 bg-brand-50 p-4 text-center">
                    <p className="font-display text-base font-bold text-brand-800">
                      Two children share this code
                    </p>
                    <p className="mt-1 text-sm text-brand-700">
                      Don&apos;t release anyone. Find a check-in lead and match the
                      child by name and guardian instead.
                    </p>
                  </div>
                ) : claimMatch ? (
                  /* A green EDGE, not a green fill. emerald-50 is a stock shade
                     with no dark override, so it stays near-white in both
                     themes — while every ink-* foreground inside it inverts. In
                     dark mode the child's name measured 1.03:1 and their room
                     1.96:1, so a volunteer saw a list of adults to release a
                     child to with no readable indication of WHICH child. That is
                     exactly the mistake the pickup code exists to prevent.
                     A surface and its text have to invert together. */
                  <div className="rounded-xl border-2 border-emerald-600 bg-white p-4">
                    <p className="text-center font-display text-lg font-bold text-ink-900">
                      {claimMatch.child?.full_name}
                    </p>
                    <p className="mb-3 text-center text-sm text-ink-500">
                      {rooms.find((r) => r.id === claimMatch.room_id)?.name ?? "—"}
                    </p>

                    {requirePickup && (
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Who is collecting?
                      </p>
                    )}

                    {!requirePickup ? null : guardiansLoading ? (
                      <p className="py-2 text-center text-sm text-ink-400">Checking pickup list…</p>
                    ) : (
                      <>
                        {allowedGuardians.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => {
                              setReleaseTo(g.id);
                              setReleaseNote("");
                            }}
                            className={
                              "mb-1.5 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition " +
                              (releaseTo === g.id
                                ? "border-emerald-600 bg-emerald-700 font-semibold text-onaccent"
                                : "border-ink-200 bg-white text-ink-800 hover:border-emerald-400")
                            }
                          >
                            <span className="flex-1">{g.name}</span>
                            {g.notes && (
                              <span className={releaseTo === g.id ? "text-xs text-emerald-50" : "text-xs text-ink-400"}>
                                {g.notes}
                              </span>
                            )}
                          </button>
                        ))}

                        {/* Someone explicitly barred from collecting is worth
                            naming, so a volunteer recognises the face. */}
                        {blockedGuardians.length > 0 && (
                          <p className="mb-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                            <span className="font-semibold">Not authorised to collect:</span>{" "}
                            {blockedGuardians.map((g) => g.name).join(", ")}
                          </p>
                        )}

                        {allowedGuardians.length === 0 && (
                          <p className="mb-1.5 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            No pickup list on file for this child. Confirm who they
                            are with a check-in lead before releasing.
                          </p>
                        )}

                        <input
                          className="ah-input mt-1 py-2 text-sm"
                          placeholder={
                            allowedGuardians.length
                              ? "Someone else? Type their name and why"
                              : "Who is collecting, and how was it confirmed?"
                          }
                          value={releaseNote}
                          onChange={(e) => {
                            setReleaseNote(e.target.value);
                            if (e.target.value.trim()) setReleaseTo("");
                          }}
                        />
                      </>
                    )}

                    <button
                      disabled={!canRelease}
                      onClick={() => {
                        checkOut(claimMatch, releaseTo || null, releaseNote || null);
                        setClaim("");
                        setReleaseTo("");
                        setReleaseNote("");
                      }}
                      className="mt-2 w-full rounded-lg bg-emerald-700 py-2.5 font-semibold text-onaccent hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {!requirePickup
                        ? "Check out"
                        : releaseTo
                          ? `Release to ${allowedGuardians.find((g) => g.id === releaseTo)?.name ?? "guardian"}`
                          : releaseNote.trim().length >= 3
                            ? "Release — reason recorded"
                            : "Choose who is collecting"}
                    </button>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-400">
                    No child checked in with that code.
                  </p>
                )}
              </div>
            )}
          </section>
          )}

          {/* Label studio (handoff screen 7) — staffed desk only. A small live
              render of the default child design so the volunteer can see what
              the printer will produce, plus one-tap reprint of whatever went
              out last. The full designer stays behind Name tags → Open
              designer, exactly where it was. */}
          {!kiosk && (
            <section aria-label="Label studio">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                Label studio
              </h2>
              <div className="rounded-xl border border-ink-100 bg-white p-3">
                {previewTemplate ? (
                  previewSrc ? (
                    <img
                      src={previewSrc}
                      alt={`Preview of the default child name tag (${previewTemplate.name})`}
                      className="w-full max-w-[320px] rounded-lg border border-ink-100"
                    />
                  ) : (
                    <div className="flex h-24 w-full max-w-[320px] items-center justify-center rounded-lg border border-ink-100 bg-ink-50 text-xs text-ink-400">
                      Rendering preview…
                    </div>
                  )
                ) : (
                  <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">
                    No child tag designed yet — the built-in layout prints until
                    one exists. Design one under Name tags → Open designer.
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs text-ink-500">
                    {previewTemplate
                      ? `${previewTemplate.name} · ${previewTemplate.width_in}″ × ${previewTemplate.height_in}″`
                      : "Built-in layout"}
                  </p>
                  <button
                    disabled={labelsPrinted === 0}
                    onClick={() => {
                      const d = lastPrintedRef.current;
                      if (d) void print(d);
                    }}
                    title="Print the most recent name tag again"
                    className="shrink-0 rounded-lg bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reprint last
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {present.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-700">
                {(c.child?.full_name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium text-ink-900">
                  {c.child?.full_name ?? "Unknown"}
                  {c.child?.has_allergy && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-onaccent">
                      Allergy
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-400">
                  {rooms.find((r) => r.id === c.room_id)?.name ?? "No room"} ·{" "}
                  {new Date(c.checked_in_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <span className="font-mono text-sm font-bold tracking-widest text-ink-500">
                {c.security_code}
              </span>
              <button
                onClick={() =>
                  print({
                    name: c.child?.full_name ?? "",
                    room: rooms.find((r) => r.id === c.room_id)?.name ?? "",
                    code: c.security_code ?? "",
                    hasAllergy: !!c.child?.has_allergy,
                    // Reprint carries the ORIGINAL check-in time, not now.
                    checkedInAt: c.checked_in_at,
                  })
                }
                className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-ink-500 hover:bg-ink-100"
                title="Reprint name tag"
              >
                ⎙
              </button>
              {/* The roster's own Check out bypasses the pickup flow entirely:
                  no code, no guardian named, no reason recorded. It exists for
                  the case where a child leaves and nobody scanned — so it stays
                  — but it must not be a one-tap release of a child sitting next
                  to a tap-happy toddler. Confirm by name, and record WHY, since
                  that note is the only trace this happened. */}
              <button
                onClick={() => {
                  const who = c.child?.full_name ?? "this child";
                  if (
                    !window.confirm(
                      `Check out ${who} without the guardian's code?\n\nUse this only when the code isn't available — the release is recorded as unverified.`,
                    )
                  )
                    return;
                  checkOut(c, null, "Checked out from the roster without a code");
                }}
                className="shrink-0 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200"
              >
                Check out
              </button>
            </div>
          ))}
          {present.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
              Nobody is checked in right now.
            </p>
          )}
        </div>
      )}

      {showFamily && (
        <FamilyRegister
          campusId={campusId}
          onClose={() => setShowFamily(false)}
          onRegistered={() => router.refresh()}
        />
      )}
      {showDesigner && (
        <TagDesigner
          initial={templates}
          onClose={() => {
            setShowDesigner(false);
            supabase
              .from("nametag_templates")
              .select("id, name, width_in, height_in, design, is_default, kind")
              .then(({ data }) => setTemplates((data ?? []) as TagTemplate[]));
          }}
        />
      )}

      {!isCheckinLead && (
        <p className="mt-6 text-xs text-ink-400">
          Allergy details are visible to check-in leads only — the red badge means
          &quot;ask a lead&quot;.
        </p>
      )}
    </div>
  );
}

/** One cell of the stat strip: 10px kicker, 26px number, 12px status line. */
function StatCell({
  kicker,
  value,
  status,
  attention = false,
}: {
  kicker: string;
  value: string;
  status: string;
  /** Renders the status line in brand-700 — "look at this now". */
  attention?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{kicker}</p>
      <p className="font-display text-[26px] font-bold leading-tight text-ink-900">{value}</p>
      <p className={`truncate text-xs ${attention ? "text-brand-700" : "text-ink-500"}`}>
        {status}
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {children}
    </button>
  );
}
