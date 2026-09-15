import { createClient as createSbClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// Service-role client for SERVER-ONLY use (bypasses RLS). Never import into a
// client component — the service-role key must never reach the browser.
export function createAdminClient() {
  // Legacy JWT keys (anon / service_role) are disabled on this project — the
  // originals leaked during the build and were revoked. Only the new secret key
  // works now, so there is deliberately no fallback.
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not configured");

  // Through the helper, not process.env directly. The project URL is committed
  // as a default in ./env, and reading the raw name here meant this client got
  // undefined wherever the build environment did not set it — which is every
  // Workers Build, since that was the whole point of committing the default.
  // The symptom was a 500 from POST /api/agent/token: an agent trading its key
  // for a session never got past this line.
  return createSbClient(supabaseUrl(), key, {
    auth: { persistSession: false },
  });
}
