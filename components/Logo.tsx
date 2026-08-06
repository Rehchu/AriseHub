// The Arise flame mark — a red flame with a white "A" cut into it. Vector so it
// scales cleanly from the sidebar to the login hero. `wordmark` adds "AriseHub".
export function Logo({
  size = 32,
  wordmark = false,
  className = "",
}: {
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M24 2c3 7-2 10-2 15 0 3 2 5 2 5s4-3 4-8c5 4 10 11 10 19 0 8-6.3 13-14 13S10 41 10 33c0-6 4-10 6-13 1 4 3 5 4 5-1-4 0-9 4-13 0 4 3 5 5 7 2-6-2-9-5-17Z"
          fill="#D2303B"
        />
        <path
          d="M24 20l-6 16h3.4l1.2-3.6h5l1.2 3.6H32L24 20Zm-0.2 6.6l1.4 4.2h-2.8l1.4-4.2Z"
          fill="#fff"
        />
      </svg>
      {wordmark && (
        <span className="font-display text-lg font-bold tracking-tight">
          Arise<span className="text-brand-500">Hub</span>
        </span>
      )}
    </span>
  );
}
