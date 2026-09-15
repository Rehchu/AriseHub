import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { bearerToken, isApiKey } from "@/lib/api-keys";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Refreshes the Supabase auth session on every request and gates the app.
// Unauthenticated users are bounced to /login (except public routes).
export async function updateSession(request: NextRequest) {
  // --- Agents ----------------------------------------------------------------
  // An agent holds no cookies. It trades its API key for a session at
  // /api/agent/token (the key is the authentication there, so it is public),
  // then sends that session as a bearer token. Without this branch every such
  // call would be redirected to /login and answer with the login page's HTML.
  if (request.nextUrl.pathname === "/api/agent/token") {
    return NextResponse.next({ request });
  }
  const bearer = bearerToken(request.headers.get("authorization"));
  if (bearer && request.nextUrl.pathname.startsWith("/api/")) {
    if (isApiKey(bearer)) {
      // The single most likely mistake, so say exactly what to do.
      return NextResponse.json(
        { error: "Exchange the API key at POST /api/agent/token, then send the access_token it returns." },
        { status: 401 },
      );
    }
    const sb = createSbClient(
      supabaseUrl(),
      supabasePublishableKey(),
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const {
      data: { user: bearerUser },
    } = await sb.auth.getUser(bearer);
    if (!bearerUser) {
      return NextResponse.json({ error: "invalid_or_expired_session" }, { status: 401 });
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/f/") || // public Connect Card submission pages
    pathname.startsWith("/join/") || // invite-link self-registration
    pathname.startsWith("/api/join") ||
    pathname.startsWith("/api/forms/submit") || // public Connect Card, Turnstile-gated
    pathname.startsWith("/api/calendar/feed") || // public iCal subscription
    pathname.startsWith("/api/cron/") || // scheduled jobs (secret-gated)
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
