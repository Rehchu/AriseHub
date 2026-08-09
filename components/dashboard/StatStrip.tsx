import Link from "next/link";

/**
 * The design's stat strip: ONE bordered container whose cells are separated by
 * internal hairlines, not four floating cards. 2-up on small screens, 4-up on
 * large — the page passes each cell the border classes its grid position needs
 * (divide-x can't describe a 2x2 that flattens to 1x4).
 */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-ink-100 bg-white lg:grid-cols-4">
      {children}
    </div>
  );
}

export function StatCell({
  kicker,
  value,
  status,
  attention = false,
  href,
  className = "",
}: {
  kicker: string;
  /** The 26px number. A string so "18 / 26" and "—" render the same way. */
  value: string;
  /** One-line 12px status under the number. */
  status: string;
  /** Status reads in brand-700 when it needs a human to act. */
  attention?: boolean;
  href?: string;
  /** Grid-position border classes from the parent strip. */
  className?: string;
}) {
  const inner = (
    <div className="px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
        {kicker}
      </p>
      <p className="mt-1.5 font-display text-[26px] font-bold leading-none text-ink-900">
        {value}
      </p>
      <p
        className={`mt-1.5 truncate text-xs ${attention ? "text-brand-700" : "text-ink-500"}`}
      >
        {status}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className={`block transition hover:bg-ink-50 ${className}`}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
