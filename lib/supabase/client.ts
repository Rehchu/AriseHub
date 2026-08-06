import { createBrowserClient } from "@supabase/ssr";

// Browser (client-component) Supabase client. Uses the anon key + the signed-in
// user's session cookie, so every query runs under RLS as that user.
// (Untyped: we annotate/cast results with the interfaces in lib/database.types.)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
