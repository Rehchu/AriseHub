"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/shell/Icon";
import { IT_PORTAL } from "./portalHandoff";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  url?: string | null;
}

/** Colour by what the status MEANS, not by its exact wording — the portal owns
 *  that vocabulary and it will grow. Anything unrecognised reads as neutral. */
function tone(status: string): string {
  const s = status.toLowerCase();
  if (/(resolved|closed|done|complete)/.test(s)) return "bg-emerald-50 text-emerald-700";
  if (/(progress|working|assigned|open)/.test(s)) return "bg-cyan-50 text-cyan-700";
  if (/(waiting|hold|pending|blocked)/.test(s)) return "bg-amber-50 text-amber-800";
  return "bg-ink-100 text-ink-600";
}

/**
 * Your IT tickets, on the dashboard.
 *
 * Renders NOTHING when the portal has no tickets for you, or when the endpoint
 * is unavailable. A dashboard card that says "couldn't load" on every visit is
 * worse than no card: it trains people to ignore the dashboard.
 */
export function MyTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/it/my-tickets")
      .then((r) => r.json())
      .then((j: { tickets?: Ticket[] }) => {
        if (!cancelled) setTickets(j.tickets ?? []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || tickets.length === 0) return null;

  return (
    <section className="rounded-xl border border-ink-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-semibold text-ink-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-onaccent">
            <Icon name="help" size={15} />
          </span>
          Your IT tickets
        </h2>
        <a href={`${IT_PORTAL}/requests`} className="text-xs font-medium text-brand-600 hover:underline">
          Open the portal
        </a>
      </div>
      <ul className="space-y-1.5">
        {tickets.slice(0, 5).map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ink-100 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{t.subject}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone(t.status)}`}>
              {t.status}
            </span>
            {t.updated_at && (
              <span className="shrink-0 text-xs text-ink-400">
                {new Date(t.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
      {tickets.length > 5 && (
        <p className="mt-2 text-xs text-ink-400">
          and {tickets.length - 5} more in the portal
        </p>
      )}
    </section>
  );
}
