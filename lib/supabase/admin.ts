import { createClient as createSbClient } from "@supabase/supabase-js";

// Service-role client for SERVER-ONLY use (bypasses RLS). Never import into a
// client component — the service-role key must never reach the browser.
export function createAdminClient() {
  // Legacy JWT keys (anon / service_role) are disabled on this project — the
  // originals leaked during the build and were revoked. Only the new secret key
  // works now, so there is deliberately no fallback.
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not configured");

  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
