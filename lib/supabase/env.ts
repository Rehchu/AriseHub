// Where the Supabase project URL and publishable key come from, in one place.
//
// Supabase renamed the "anon key" to the "publishable key". It is the same
// value under two names, and build environments configured before the rename
// still supply the old one. This app reads the new name everywhere, so an
// environment that sets only NEXT_PUBLIC_SUPABASE_ANON_KEY hands createClient()
// undefined — which compiles and typechecks clean and then dies prerendering
// /login, with an error that names neither variable. That cost a session to
// work out once already (see CLAUDE.md); accepting both names retires it.
//
// The reads must stay written out as literal `process.env.NEXT_PUBLIC_…`
// expressions: Next inlines those by textual replacement at build time, so a
// dynamic lookup like process.env[name] would resolve to undefined in the
// browser bundle no matter what is set.
//
// BOTH VALUES ARE COMMITTED BELOW as defaults, and that is deliberate. They are
// public by construction — the same URL is already in the portal's
// arise-it-portal/worker/wrangler.jsonc, /api/agent/token hands the publishable
// key to any caller that asks, and Next inlines both into every browser bundle
// this app ships. Nothing is protected by keeping them out of the repository;
// what protects the data is RLS. What they DO buy, sitting here, is a build
// that needs no build-time environment at all — which is the single fault that
// kept Cloudflare Workers Builds from ever shipping this app, because its build
// variables live on a dashboard screen nobody had filled in. A checkout now
// builds and deploys on its own.

/** The production project. Public values — see the note above. */
const DEFAULT_URL = "https://luzmqpfsylpqxbwzyjcz.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_WXFBUKEn5Y7hxSsE0mOW5g_K6WlhWaN";

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ENV_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const URL = ENV_URL || DEFAULT_URL;
const PUBLISHABLE_KEY = ENV_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;

/**
 * Pointing the build at another project (a local stack, a branch database)
 * means supplying that project's key too. Falling back to the production key
 * baked in above would authenticate against the wrong project and fail in a way
 * that looks like anything but a configuration mistake, so refuse instead.
 */
function assertCoherent(): void {
  if (ENV_URL && ENV_URL !== DEFAULT_URL && !ENV_PUBLISHABLE_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL points at a different project, but no key was " +
        "supplied with it. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY) alongside it — the two travel together. " +
        "Both are read at BUILD time, not just at run time, because Next inlines " +
        "them: supply them in the env block of .github/workflows/deploy.yml, or " +
        "in the Worker's own build settings under Cloudflare Workers Builds. " +
        "Setting them only as a Worker secret is not enough.",
    );
  }
}

/** The Supabase project URL. */
export function supabaseUrl(): string {
  assertCoherent();
  return URL;
}

/** The Supabase publishable key, under either of its two names. */
export function supabasePublishableKey(): string {
  assertCoherent();
  return PUBLISHABLE_KEY;
}
