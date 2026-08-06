import { createClient as createSbClient } from "@supabase/supabase-js";

// Service-role client for SERVER-ONLY use (bypasses RLS). Never import into a
// client component — the service-role key must never reach the browser.
export function createAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
