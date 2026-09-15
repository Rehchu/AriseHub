import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Browser (client-component) Supabase client. Uses the anon key + the signed-in
// user's session cookie, so every query runs under RLS as that user.
// (Untyped: we annotate/cast results with the interfaces in lib/database.types.)
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
