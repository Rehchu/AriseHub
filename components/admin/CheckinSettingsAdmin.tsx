"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AutoCheckoutRule {
  id: string;
  day_of_week: number;
  at_time: string;
  active: boolean;
  label: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "20:30:00" -> "8:30pm", which is how anyone here would say it. */
function pretty(t: string): string {
  const [hRaw, m] = t.split(":");
  const h = Number(hRaw);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${suffix}`;
}

export function CheckinSettingsAdmin({
  requirePickup: initialRequirePickup,
  autoCheckoutEnabled: initialAuto,
  rules: initialRules,
  campuses,
}: {
  requirePickup: boolean;
  autoCheckoutEnabled: boolean;
  rules: AutoCheckoutRule[];
  campuses: { name: string; timezone: string | null }[];
}) {
  const supabase = createClient();

  const [requirePickup, setRequirePickup] = useState(initialRequirePickup);
  const [autoCheckout, setAutoCheckout] = useState(initialAuto);
  const [rules, setRules] = useState(initialRules);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newDay, setNewDay] = useState(0);
  const [newTime, setNewTime] = useState("13:30");
  const [newLabel, setNewLabel] = useState("");

  async function saveSettings(patch: {
    require_pickup_verification?: boolean;
    auto_checkout_enabled?: boolean;
  }) {
    setError(null);
    const { error } = await supabase.from("checkin_settings").update(patch).eq("id", true);
    if (error) {
      setError(error.message);
      // Put the switch back where it was rather than lying about the state.
      if (patch.require_pickup_verification !== undefined) setRequirePickup(!patch.require_pickup_verification);
      if (patch.auto_checkout_enabled !== undefined) setAutoCheckout(!patch.auto_checkout_enabled);
      return;
    }
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 2500);
  }

  async function addRule() {
    setError(null);
    const { data, error } = await supabase
      .from("checkin_auto_checkout_rules")
      .insert({ day_of_week: newDay, at_time: newTime, label: newLabel.trim() || null })
      .select("id, day_of_week, at_time, active, label")
      .single();
    if (error) return setError(error.message);
    setRules((rs) => [...rs, data as AutoCheckoutRule].sort(
      (a, b) => a.day_of_week - b.day_of_week || a.at_time.localeCompare(b.at_time),
    ));
    setNewLabel("");
  }

  async function toggleRule(r: AutoCheckoutRule) {
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    const { error } = await supabase
      .from("checkin_auto_checkout_rules")
      .update({ active: !r.active })
      .eq("id", r.id);
    if (error) {
      setError(error.message);
      setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, active: r.active } : x)));
    }
  }

  async function removeRule(r: AutoCheckoutRule) {
    if (!window.confirm(`Remove the ${DAYS[r.day_of_week]} ${pretty(r.at_time)} cutoff?`)) return;
    setRules((rs) => rs.filter((x) => x.id !== r.id));
    const { error } = await supabase.from("checkin_auto_checkout_rules").delete().eq("id", r.id);
    if (error) {
      setError(error.message);
      setRules((rs) => [...rs, r].sort((a, b) => a.day_of_week - b.day_of_week));
    }
  }

  // Kiosk exit PIN. The hash never leaves the database — all the UI can know is
  // whether one exists.
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [newPin, setNewPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  useEffect(() => {
    supabase.rpc("kiosk_exit_pin_is_set").then(({ data }) => setPinSet(data === true));
  }, [supabase]);

  async function savePin(value: string | null) {
    setPinBusy(true);
    setError(null);
    const { error } = await supabase.rpc("kiosk_set_exit_pin", { pin: value });
    setPinBusy(false);
    if (error) return setError(error.message);
    setPinSet(!!value);
    setNewPin("");
    setMsg(value ? "Kiosk PIN set." : "Kiosk PIN removed.");
    setTimeout(() => setMsg(null), 2500);
  }

  const tz = campuses[0]?.timezone ?? "America/Chicago";

  return (
    <div className="mt-6 space-y-6">
      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

      <section className="rounded-xl border border-ink-100 bg-white p-4">
        <h2 className="font-display text-base font-bold text-ink-900">Pickup</h2>
        <label className="mt-3 flex items-start gap-3 text-sm text-ink-800">
          <input
            type="checkbox"
            className="mt-1"
            checked={requirePickup}
            onChange={(e) => {
              setRequirePickup(e.target.checked);
              saveSettings({ require_pickup_verification: e.target.checked });
            }}
          />
          <span>
            Verify who is collecting each child
            <span className="mt-0.5 block text-xs text-ink-500">
              On: the station shows the child&apos;s pickup list and won&apos;t release
              until a volunteer names who took them — or writes down why they
              released to somebody else. Off: entering the code checks the child
              out in one tap, for services where children simply leave with
              their parents.
            </span>
          </span>
        </label>
      </section>



      <section className="rounded-xl border border-ink-100 bg-white p-4">
        <h2 className="font-display text-base font-bold text-ink-900">Tablet lockdown</h2>
        <p className="mt-1 text-xs text-ink-500">
          Open <span className="font-medium">/kiosk</span> on the check-in tablet
          and tap <span className="font-medium">Lock this tablet</span>. Locked, it
          keeps the screen awake, goes full-screen and refuses to leave the
          check-in page — including the back button and a reload. Unlocking asks
          for this PIN.
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">This locks the app, not the tablet.</span>{" "}
          Someone holding the device can still swipe to the home screen. For a
          tablet left out in the lobby, also turn on{" "}
          <span className="font-medium">Guided Access</span> (iPad: Settings →
          Accessibility → Guided Access, then triple-click the side button) or{" "}
          <span className="font-medium">Screen Pinning</span> (Android: Settings →
          Security → App pinning). That is what actually stops someone leaving
          the app.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-ink-500">
            Exit PIN (4–8 digits)
            <input
              className="ah-input mt-0.5 w-40 py-1.5 text-center tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              placeholder={pinSet ? "••••••" : "not set"}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button
            onClick={() => savePin(newPin)}
            disabled={pinBusy || newPin.length < 4}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-50"
          >
            {pinSet ? "Change PIN" : "Set PIN"}
          </button>
          {pinSet && (
            <button
              onClick={() => savePin(null)}
              disabled={pinBusy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              Remove
            </button>
          )}
          <span className="text-xs text-ink-400">
            {pinSet === null ? "" : pinSet ? "A PIN is set." : "No PIN — anyone can leave kiosk mode."}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-ink-100 bg-white p-4">
        <h2 className="font-display text-base font-bold text-ink-900">Automatic check-out</h2>
        <p className="mt-1 text-xs text-ink-500">
          Nobody checks every child out, so records sit open and next week&apos;s
          roster is wrong. Anyone still checked in past the cutoff is closed out
          automatically and marked as such, so attendance stays honest about the
          fact that nobody was verified at pickup.
        </p>
        <p className="mt-1 text-xs text-ink-400">
          Times are local to each campus ({tz}), so they hold across daylight saving.
        </p>

        <label className="mt-3 flex items-center gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            checked={autoCheckout}
            onChange={(e) => {
              setAutoCheckout(e.target.checked);
              saveSettings({ auto_checkout_enabled: e.target.checked });
            }}
          />
          Run automatic check-out
        </label>

        <ul className="mt-3 space-y-1.5">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm"
            >
              <input type="checkbox" checked={r.active} onChange={() => toggleRule(r)} />
              <span className={r.active ? "text-ink-800" : "text-ink-400 line-through"}>
                <span className="font-medium">{DAYS[r.day_of_week]}</span> at {pretty(r.at_time)}
                {r.label && <span className="ml-2 text-xs text-ink-400">{r.label}</span>}
              </span>
              <span className="flex-1" />
              <button
                onClick={() => removeRule(r)}
                className="rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
              >
                Remove
              </button>
            </li>
          ))}
          {rules.length === 0 && (
            <li className="rounded-lg border border-dashed border-ink-200 px-3 py-3 text-sm text-ink-400">
              No cutoffs — check-ins will stay open until someone closes them.
            </li>
          )}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-ink-500">
            Day
            <select
              className="ah-input mt-0.5 w-auto py-1.5 text-sm"
              value={newDay}
              onChange={(e) => setNewDay(Number(e.target.value))}
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-500">
            Time
            <input
              type="time"
              className="ah-input mt-0.5 w-auto py-1.5 text-sm"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
          </label>
          <label className="flex-1 text-xs font-medium text-ink-500">
            Label (optional)
            <input
              className="ah-input mt-0.5 py-1.5 text-sm"
              placeholder="Wednesday evening"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </label>
          <button
            onClick={addRule}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
          >
            Add cutoff
          </button>
        </div>
      </section>
    </div>
  );
}
