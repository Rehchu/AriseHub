"use client";

// Which dashboard someone wants: a grid of buttons, or the full view.
//
// Per device rather than per account, like the theme and the name-tag options —
// the same person may want big buttons on the foyer tablet and the full view on
// their laptop.
//
// Two components care (the dashboard and the sidebar) and neither owns the
// other, so changes are broadcast on a window event. localStorage's own
// "storage" event only fires in OTHER tabs, which would leave this one stale.

export type DashboardView = "grid" | "advanced";

const KEY = "arisehub-dashboard-view";
const EVENT = "arisehub:dashboard-view";

/** Grid is the default: it is the layout the church already knew. */
export function readDashboardView(): DashboardView {
  if (typeof window === "undefined") return "grid";
  try {
    return localStorage.getItem(KEY) === "advanced" ? "advanced" : "grid";
  } catch {
    return "grid";
  }
}

export function writeDashboardView(view: DashboardView) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    /* private browsing — the choice just won't persist */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: view }));
}

/** Subscribe to changes made anywhere in this tab. */
export function onDashboardViewChange(fn: (view: DashboardView) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<DashboardView>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
