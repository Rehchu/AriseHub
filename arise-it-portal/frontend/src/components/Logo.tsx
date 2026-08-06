// Arise IT logo — the church's flame+A mark (brand red) recreated as clean
// vector, paired with an optional "ARISE IT" wordmark. Mark alone = app/PWA
// icon; lockup = login screen + PDF posters. All fills (no fonts/strokes) so
// it renders identically as an SVG, a rasterized PWA icon, and in PDFs.

export const FLAME_PATH =
  "M50 4 C 58 22 74 30 68 50 C 65 59 58 61 55 56 C 60 69 53 77 55 87 C 71 82 83 66 78 46 C 90 61 90 82 67 92 C 61 94 56 95 50 95 C 33 95 20 81 24 63 C 26 52 35 47 39 51 C 33 38 40 21 50 4 Z";

// White stencil "A" sitting in the lower-center of the flame (matches the
// church logo's negative-space A). Outer triangle with a triangular counter
// (evenodd) plus a crossbar.
export const A_OUTLINE = "M50 40 L64 80 L36 80 Z M50 56 L58 77 L42 77 Z";
export const A_CROSSBAR = "M43 69 L57 69 L59 75 L41 75 Z";

export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d={FLAME_PATH} fill="#d2303b" />
      <path d={A_OUTLINE} fill="#ffffff" fillRule="evenodd" />
      <path d={A_CROSSBAR} fill="#ffffff" />
    </svg>
  );
}

export default function Logo({
  size = 40,
  variant = "lockup",
  className = "",
  wordmarkClassName = "",
}: {
  size?: number;
  variant?: "mark" | "lockup";
  className?: string;
  wordmarkClassName?: string;
}) {
  if (variant === "mark") return <LogoMark size={size} className={className} />;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <div className={`font-display font-bold leading-none tracking-wide ${wordmarkClassName}`}>
        <div style={{ fontSize: size * 0.42 }}>ARISE</div>
        <div style={{ fontSize: size * 0.42 }} className="text-brand-500">
          IT
        </div>
      </div>
    </div>
  );
}
