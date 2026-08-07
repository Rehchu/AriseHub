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
  printImageViaBrowser,
  type DymoStatus,
} from "@/lib/dymo";
import { renderTagToPng, type TagTemplate } from "@/lib/tag-design";
import { TagDesigner } from "./TagDesigner";
import { FamilyRegister } from "./FamilyRegister";

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
function makeCode() {
  let s = "";
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
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
  currentProfileId,
  campusId,
  isCheckinLead,
}: {
  initial: CheckinRow[];
  rooms: RoomRow[];
  people: PersonRow[];
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
  useEffect(() => {
    supabase
      .from("nametag_templates")
      .select("id, name, width_in, height_in, design, is_default, kind")
      .then(({ data }) => setTemplates((data ?? []) as TagTemplate[]));
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
      const g = forKind("guardian");
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
        });
        const ok = await printImageViaDymo(png, tpl.width_in, tpl.height_in, printer || undefined);
        if (!ok) printImageViaBrowser(png, tpl.width_in, tpl.height_in);
      }
      return;
    }

    // No designed template yet — fall back to the built-in layout.
    if (await printViaDymo(d, tagOpts, printer || undefined)) return;
    const server = localStorage.getItem("ah-print-server");
    if (server && (await printViaServer(d, tagOpts, server))) return;
    printNameTag(d, tagOpts);
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

  async function checkOut(c: CheckinRow) {
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
      })
      .eq("id", c.id);
    if (error) setError(error.message);
  }

  // Pickup: match the guardian's claim tag to a present child.
  const claimMatch = claim.trim().length >= 3
    ? present.find((c) => c.security_code?.toUpperCase() === claim.trim().toUpperCase())
    : undefined;

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
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
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
              placeholder="http://192.168.1.50:41952"
              defaultValue={
                typeof window !== "undefined"
                  ? (localStorage.getItem("ah-print-server") ?? "")
                  : ""
              }
              onBlur={(e) => localStorage.setItem("ah-print-server", e.target.value.trim())}
            />
            <span className="mt-1 block text-xs text-ink-400">
              Address of the desktop running the print agent with the DYMO on USB.
              Leave blank if this device prints directly.
            </span>
          </label>
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
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
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
                          className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                          title="Has an allergy on file — ask a check-in lead for details"
                        >
                          Allergy
                        </span>
                      )}
                    </div>
                    {already ? (
                      <p className="mt-1 text-xs text-emerald-700">Already checked in</p>
                    ) : (
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
                            checkIn(p, sel?.value ?? "");
                          }}
                          className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                        >
                          Check in
                        </button>
                      </div>
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
              placeholder="ABCD"
              maxLength={4}
              value={claim}
              onChange={(e) => setClaim(e.target.value.toUpperCase())}
            />
            {claim.trim().length >= 3 && (
              <div className="mt-3">
                {claimMatch ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                    <p className="font-display text-lg font-bold text-ink-900">
                      {claimMatch.child?.full_name}
                    </p>
                    <p className="mb-3 text-sm text-ink-500">
                      {rooms.find((r) => r.id === claimMatch.room_id)?.name ?? "—"}
                    </p>
                    <button
                      onClick={() => {
                        checkOut(claimMatch);
                        setClaim("");
                      }}
                      className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700"
                    >
                      Release to guardian
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
                    <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
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
