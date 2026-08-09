"use client";

import { useEffect, useState } from "react";
import { StatCell } from "./StatStrip";

interface Ticket {
  id: string;
  subject: string;
  status: string;
}

/**
 * "Open" mirrors components/it/MyTickets.tsx: anything the portal does not
 * describe as finished still needs someone. The portal owns the status
 * vocabulary, so match meaning, not exact wording.
 */
const CLOSED = /(resolved|closed|done|complete)/i;

/**
 * My open IT tickets, as a stat cell. Reuses the same /api/it/my-tickets
 * endpoint as the old dashboard's MyTickets list — the portal handoff and
 * auth all live behind that route already.
 */
export function ItTicketsStat({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/it/my-tickets")
      .then((r) => r.json())
      .then((j: { tickets?: Ticket[]; available?: boolean }) => {
        if (cancelled) return;
        // The route degrades quietly: portal down or unconfigured is a 200
        // with available:false. A confident "0 open" would be a lie then.
        if (j.available === false) setFailed(true);
        else setOpen((j.tickets ?? []).filter((t) => !CLOSED.test(t.status)).length);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StatCell
      className={className}
      href="/it"
      kicker="My IT tickets"
      value={failed || open === null ? "—" : String(open)}
      status={failed ? "portal unavailable" : open ? "open in the portal" : "none open"}
    />
  );
}
