"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface MaintenanceRequest {
  id: string;
  title: string;
  location: string;
  details: string | null;
  photo_key: string | null;
  urgent: boolean;
  status: "open" | "in_progress" | "done" | "cancelled";
  reported_by: string | null;
  reported_for: string | null;
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  reporter?: { full_name: string } | null;
  owner?: { full_name: string } | null;
}

const STATUS_STYLE: Record<MaintenanceRequest["status"], string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-ink-100 text-ink-500",
};

const STATUS_LABEL: Record<MaintenanceRequest["status"], string> = {
  open: "Open",
  in_progress: "Being fixed",
  done: "Done",
  cancelled: "Cancelled",
};

export function MaintenanceBoard({
  rows,
  team,
  isTeam,
  currentProfileId,
}: {
  rows: MaintenanceRequest[];
  team: { id: string; full_name: string }[];
  /** Maintenance department, staff or Super_Admin — the people who work these. */
  isTeam: boolean;
  currentProfileId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [onBehalf, setOnBehalf] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  const active = useMemo(
    () => rows.filter((r) => r.status === "open" || r.status === "in_progress"),
    [rows],
  );
  const finished = useMemo(
    () => rows.filter((r) => r.status === "done" || r.status === "cancelled").slice(0, 20),
    [rows],
  );

  async function report(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      let photoKey: string | null = null;
      if (photo) {
        const up = new FormData();
        up.append("file", photo);
        up.append("folder", "maintenance");
        const res = await fetch("/api/files/upload", { method: "POST", body: up });
        if (res.ok) photoKey = ((await res.json()) as { key?: string }).key ?? null;
        // A failed photo must not lose the report — the words are the point.
      }
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title") ?? ""),
          location: String(form.get("location") ?? ""),
          details: String(form.get("details") ?? ""),
          urgent: form.get("urgent") === "on",
          reportedFor: onBehalf ? String(form.get("reportedFor") ?? "") : "",
          photoKey,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't send that");
      setSent(true);
      setPhoto(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(r: MaintenanceRequest, status: MaintenanceRequest["status"]) {
    setBusy(true);
    const { error: err } = await supabase
      .from("maintenance_requests")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", r.id);
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }

  async function assign(r: MaintenanceRequest, to: string) {
    setBusy(true);
    const { error: err } = await supabase
      .from("maintenance_requests")
      .update({ assigned_to: to || null })
      .eq("id", r.id);
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }

  const card = (r: MaintenanceRequest) => (
    <li
      key={r.id}
      className={`rounded-xl border bg-white p-4 ${
        r.urgent && r.status !== "done" ? "border-red-300" : "border-ink-100"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink-900">
          {r.urgent && r.status !== "done" && (
            <span className="mr-1.5 text-xs font-bold uppercase text-red-600">Urgent</span>
          )}
          {r.title}
        </h3>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[r.status]}`}
        >
          {STATUS_LABEL[r.status]}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-ink-600">{r.location}</p>
      {r.details && <p className="mt-1 text-sm text-ink-700">{r.details}</p>}
      {r.photo_key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${r.photo_key}`}
          alt=""
          className="mt-2 max-h-56 rounded-lg border border-ink-100 object-contain"
        />
      )}
      <p className="mt-1.5 text-xs text-ink-400">
        {r.reported_for
          ? `${r.reported_for} — logged by ${r.reporter?.full_name ?? "someone"}`
          : (r.reporter?.full_name ?? "Someone")}
        {" · "}
        {new Date(r.created_at).toLocaleDateString()}
        {r.owner?.full_name ? ` · ${r.owner.full_name} is on it` : ""}
      </p>

      {isTeam && r.status !== "done" && r.status !== "cancelled" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={r.assigned_to ?? ""}
            onChange={(e) => assign(r, e.target.value)}
            disabled={busy}
            aria-label="Who's fixing it"
            className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
          >
            <option value="">Nobody yet</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
          {r.status === "open" && (
            <button
              onClick={() => setStatus(r, "in_progress")}
              disabled={busy}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-50"
            >
              On it
            </button>
          )}
          <button
            onClick={() => setStatus(r, "done")}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent disabled:opacity-50"
          >
            Fixed
          </button>
          <button
            onClick={() => setStatus(r, "cancelled")}
            disabled={busy}
            className="ml-auto text-xs text-ink-400 hover:text-ink-700"
          >
            Not needed
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Maintenance</h1>
      <p className="mb-4 text-sm text-ink-500">
        Something broken? Tell us here so it doesn&apos;t get forgotten — the maintenance team
        gets it on their phones.
      </p>

      {sent ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Sent — maintenance have it.{" "}
          <button onClick={() => setSent(false)} className="underline">
            Report something else
          </button>
        </div>
      ) : (
        <form action={report} className="mb-6 rounded-xl border border-ink-100 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink-700 sm:col-span-2">
              What&apos;s wrong?
              <input
                name="title"
                required
                placeholder="Toilet won't stop running"
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-ink-700 sm:col-span-2">
              Where is it?
              <input
                name="location"
                required
                placeholder="Men's room by the lobby"
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-ink-700 sm:col-span-2">
              Anything else <span className="text-ink-400">(optional)</span>
              <textarea
                name="details"
                rows={2}
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 text-sm text-ink-700">
            Photo <span className="text-ink-400">(optional — often quicker than explaining)</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-onaccent"
            />
          </div>

          <label className="mt-3 flex items-start gap-2 text-sm text-ink-700">
            <input type="checkbox" name="urgent" className="mt-1" />
            <span>
              This can&apos;t wait
              <span className="block text-xs text-ink-500">
                Water, power, or anything unsafe.
              </span>
            </span>
          </label>

          {/* Most of these still arrive as "hey, the door's broken" on a Sunday.
              This lets whoever was told turn that into a record. */}
          <label className="mt-2 flex items-start gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={onBehalf}
              onChange={(e) => setOnBehalf(e.target.checked)}
              className="mt-1"
            />
            <span>
              Someone told me about this
              <span className="block text-xs text-ink-500">
                Logging it for them so it isn&apos;t lost.
              </span>
            </span>
          </label>
          {onBehalf && (
            <input
              name="reportedFor"
              placeholder="Who mentioned it"
              className="mt-2 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            />
          )}

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent disabled:opacity-50"
          >
            <Icon name="wrench" size={16} />
            {busy ? "Sending…" : "Send to maintenance"}
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
          {isTeam ? `Needs doing (${active.length})` : "Yours, open"}
        </h2>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
            Nothing outstanding.
          </p>
        ) : (
          <ul className="space-y-2">{active.map(card)}</ul>
        )}
      </section>

      {finished.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Recently sorted
          </h2>
          <ul className="space-y-2">{finished.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
