// Where the Supabase publishable key comes from, in one place.
//
// Supabase renamed the "anon key" to the "publishable key". It is the same
// value under two names, and build environments configured before the rename
// still supply the old one. This app reads the new name everywhere, so an
// environment that sets only NEXT_PUBLIC_SUPABASE_ANON_KEY hands createClient()
// undefined — which compiles and typechecks clean and then dies prerendering
// /login, with an error that names neither variable. That cost a session to
// work out once already (see CLAUDE.md); accepting both names retires it.
//
// The two reads must stay written out as literal `process.env.NEXT_PUBLIC_…`
// expressions: Next inlines those by textual replacement at build time, so a
// dynamic lookup like process.env[name] would resolve to undefined in the
// browser bundle no matter what is set.

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/** The Supabase project URL. Throws with what to set if it is missing. */
export function supabaseUrl(): string {
  if (!URL) throw new Error(missing("NEXT_PUBLIC_SUPABASE_URL"));
  return URL;
}

/**
 * The Supabase publishable key, under either of its two names. Throws with
 * what to set if neither is present, rather than letting createClient() fail
 * further down with a message that does not mention the environment.
 */
export function supabasePublishableKey(): string {
  if (!PUBLISHABLE_KEY) {
    throw new Error(
      missing("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)"),
    );
  }
  return PUBLISHABLE_KEY;
}

function missing(name: string): string {
  return (
    `${name} is not set. It is needed at BUILD time, not just at run time: ` +
    "GitHub Actions reads it from the env block in .github/workflows/deploy.yml, " +
    "and Cloudflare Workers Builds from the Worker's own build settings in the " +
    "dashboard. Setting it only as a Worker secret is not enough."
  );
}
