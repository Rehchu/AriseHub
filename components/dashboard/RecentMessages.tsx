import Link from "next/link";

export interface RecentMessageRow {
  channelId: string;
  label: string;
  /** Last message body, or a placeholder for a silent channel. */
  preview: string;
  /** Short date of the last message; empty for channels with none. */
  dateLabel: string;
}

/**
 * The right-hand column: my channels, newest conversation first, one-line
 * preview each. Pure presentation — the server page owns the queries.
 */
export function RecentMessages({ rows }: { rows: RecentMessageRow[] }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white">
      <header className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-ink-900">
          Recent messages
        </h2>
        <Link
          href="/messages"
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          All messages
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-500">
          No conversations yet —{" "}
          <Link href="/messages" className="font-medium text-brand-600 hover:underline">
            start one in Messages
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((r) => (
            <li key={r.channelId}>
              <Link
                href={`/messages/${r.channelId}`}
                className="block px-4 py-2 transition hover:bg-ink-50"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-ink-900">
                    {r.label}
                  </span>
                  {r.dateLabel && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
                      {r.dateLabel}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-500">
                  {r.preview}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
