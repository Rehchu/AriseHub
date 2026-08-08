"use client";

import { useEffect, useMemo, useState } from "react";
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
}: {
  initial: CheckinRow[];
  rooms: RoomRow[];
  people: PersonRow[];
  /** profile id -> the other people in their household. Optional: /kiosk omits it. */
  siblings?: Record<string, string[]>;
  currentProfileId: string;
  campusId: string | null;
  isCheckinLead: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [checkins, setCheckins] = useState<CheckinRow[]>(initial);
  const [tab, setTab] = useState<"checkin" | "roster">("checkin");
  const [q, setQ] = useState("");
  const [claim, setClaim] = useState("");
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
      .select("require_pickup_verification")
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { require_pickup_verification: boolean } | null;
        if (row) setRequirePickup(row.require_pickup_verification);
      });
  }, [supabase]);

  // Print chain: designed template (rendered to an image) if one exists, then
  // DYMO Connect on this machine → the shared desktop print agent (for iPads)
  // → the browser print dialog. First one that works wins.
  async function print(d: NameTagData) {
    const forKind = (kind: "child" | "guardian") =>
      templates.find((t) => t.kind === kind && t.is_default) ??
      templates.find((t) => t.kind === kind);

    const toPrint: TagTemplate[] = [];
    const child = forKind("child");
    if (child) toPrint.push(child);
    if (tagOpts.showGuardianTag) {
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
          church: tagOpts.churchName,
          hasAllergy: d.hasAllergy,
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
    const direct = await printViaDymo(d, tagOpts, printer || undefined);
    attempts.push(direct);
    if (direct.ok) return setPrintLog(attempts);
    const server = localStorage.getItem("ah-print-server");
    if (server) {
      const viaAgent = await printViaServer(d, tagOpts, server);
      attempts.push(viaAgent);
      if (viaAgent.ok) return setPrintLog(attempts);
    }
    printNameTag(d, tagOpts);
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
    setCheckins((cs) =>
      cs.map((x) =>
        x.id === c.id
          ? { ...x, status: "checked_out", checked_out_at: new Date().toISOString() }
          : x,
      ),
    );
    const { error } = await supabase
      .from("checkins")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: currentProfileId,
        released_to_profile_id: releasedTo ?? null,
        release_note: note?.trim() || null,
      })
      .eq("id", c.id);
    if (error) setError(error.message);
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">Check-In</h1>
        <p className="mt-1 text-ink-500">
          {present.length} checked in right now
          {activeRooms.length === 0 && " · no rooms set up yet"}
        </p>
      </div>

      {activeRooms.length === 0 && (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No rooms exist yet. Add rooms (with age ranges and capacity) before running
          check-in, so children get auto-assigned correctly.
        </p>
      )}

      <div className="mb-5 flex items-center gap-1 border-b border-ink-100">
        <TabBtn active={tab === "checkin"} onClick={() => setTab("checkin")}>Check in / out</TabBtn>
        <TabBtn active={tab === "roster"} onClick={() => setTab("roster")}>Roster ({present.length})</TabBtn>
        <div className="flex-1" />
        <button
          onClick={() => setShowTagSettings((s) => !s)}
          className="mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
        >
          <Icon name="form" size={16} /> Name tags
        </button>
      </div>

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
                ["showGuardianTag", "Also print guardian pickup tag"],
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

      {tab === "checkin" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Check IN */}
          {(offline || queued > 0) && (
            <div className={"mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm " + (offline ? "bg-amber-50 text-amber-800" : "bg-ink-100 text-ink-600")}>
              <Icon name="help" size={16} />
              <span className="flex-1">
                {offline
                  ? "Offline — check-ins are saved on this device and will sync automatically."
                  : "Syncing " + queued + " check-in" + (queued === 1 ? "" : "s") + "…"}
              </span>
              {queued > 0 && (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold">{queued}</span>
              )}
            </div>
          )}

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
                      <p className="mt-1 text-xs text-emerald-700">Already checked in</p>
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

          {/* Check OUT by claim code */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Pickup — enter the guardian&apos;s code
            </h2>
            <input
              className="ah-input text-center font-mono text-2xl tracking-[0.3em] uppercase"
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
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
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
              <button
                onClick={() => checkOut(c)}
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
