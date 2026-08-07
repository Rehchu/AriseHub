import { createClient as createSbClient } from "@supabase/supabase-js";

// Service-role client for SERVER-ONLY use (bypasses RLS). Never import into a
// client component — the service-role key must never reach the browser.
export function createAdminClient() {
  // Supabase is migrating from legacy JWT keys (anon / service_role) to the new
  // publishable / secret keys. Prefer the new secret key so the legacy one can
  // be disabled; fall back to the legacy key so nothing breaks mid-migration.
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("No Supabase secret key configured");

  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
