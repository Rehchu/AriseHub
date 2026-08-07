import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Browser hardening. Set here rather than in next.config.ts because on
// Cloudflare Workers many responses are served ahead of the Next request
// pipeline, and headers() never runs for those.
const SECURITY_HEADERS: Record<string, string> = {
  // Nothing in AriseHub should ever be embedded in another site.
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  // A URL here can name a person — don't hand it to third-party sites.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Camera stays allowed: check-in kiosk and profile photos use it.
  "Permissions-Policy": "geolocation=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals, static assets, and PWA files.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
