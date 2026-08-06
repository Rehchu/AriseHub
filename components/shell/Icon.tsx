// Minimal inline icon set (no icon-library dependency). Stroke-based, 24x24.
const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  chat: "M4 5h16v11H8l-4 3V5Z",
  users: "M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 19a3 3 0 0 0-4-2.8M18 11a2.5 2.5 0 0 0 0-5",
  badge: "M6 3h12v18l-6-3-6 3V3ZM9 8h6M9 12h6",
  group: "M7 20a5 5 0 0 1 10 0M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  calendar: "M4 6h16v14H4V6ZM4 10h16M8 3v4M16 3v4",
  music: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  wrench: "M14 7a4 4 0 0 1-5.3 5.3L4 17l3 3 4.7-4.7A4 4 0 0 0 17 10l-3-3Z",
  help: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1.5 1-1.5 2M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  logout: "M15 12H3M3 12l4-4M3 12l4 4M11 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6",
  menu: "M4 7h16M4 12h16M4 17h16",
  send: "M4 12l16-8-6 16-3-6-7-2Z",
  x: "M6 6l12 12M18 6 6 18",
  task: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 14l2 2 4-4",
  check: "M5 12l4 4L19 7",
};

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.home} />
    </svg>
  );
}
