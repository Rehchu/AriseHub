"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/shell/Icon";
import type { ModuleDef } from "@/lib/modules";
import {
  onDashboardViewChange,
  readDashboardView,
  writeDashboardView,
  type DashboardView,
} from "@/lib/dashboard-view";

/**
 * Two dashboards: a grid of buttons, and the full view.
 *
 * The grid is the layout the church already knew before the redesign — every
 * module one tap away, nothing to read. The full view is everything the
 * dashboard grew since: the weekend's staffing, replies still out, recent
 * messages, and the leader/campus panels.
 *
 * The server renders BOTH and this picks between them, so switching is instant
 * and needs no round trip. The advanced view is only built when someone is
 * actually on it, so the grid stays cheap.
 */
export function DashboardSwitch({
  modules,
  advanced,
  greeting,
}: {
  modules: ModuleDef[];
  advanced: React.ReactNode;
  greeting: React.ReactNode;
}) {
  // Server-render the grid, then correct on mount. Reading localStorage during
  // render would mismatch the server HTML and blank the page.
  const [view, setView] = useState<DashboardView>("grid");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setView(readDashboardView());
    setReady(true);
    return onDashboardViewChange(setView);
  }, []);

  const toggle = () => {
    const next: DashboardView = view === "grid" ? "advanced" : "grid";
    setView(next);
    writeDashboardView(next);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">{greeting}</div>
        <button
          onClick={toggle}
          className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
          title={
            view === "grid"
              ? "Show the weekend's details"
              : "Show the simple grid of buttons"
          }
        >
          {view === "grid" ? "Detailed view" : "Simple view"}
        </button>
      </div>

      {/* Until the stored choice is read, show nothing rather than flashing the
          wrong dashboard for a frame. */}
      {ready && (view === "grid" ? <ModuleGrid modules={modules} /> : advanced)}
    </>
  );
}

function ModuleGrid({ modules }: { modules: ModuleDef[] }) {
  const tiles = modules.filter((m) => m.key !== "dashboard" && m.ready);
  return (
    <nav aria-label="Modules" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((m) => (
        <Link
          key={m.key}
          href={m.href}
          className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-ink-100 bg-white p-4 text-center transition hover:border-ink-200 hover:shadow-sm"
        >
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl text-onaccent"
            style={{ backgroundColor: m.accent }}
          >
            <Icon name={m.icon} size={22} />
          </span>
          <span className="text-sm font-semibold text-ink-800">{m.label}</span>
        </Link>
      ))}
    </nav>
  );
}
