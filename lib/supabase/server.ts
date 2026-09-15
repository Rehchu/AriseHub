import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { bearerToken } from "@/lib/api-keys";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Server-component / route-handler Supabase client. Reads and writes the auth
// cookies via Next's cookie store so the session stays in sync.
//
// An agent has no cookies: it sends the session it got from /api/agent/token as
// `Authorization: Bearer <access_token>` (docs/agent-access.md). The middleware
// has already verified that token, so here the client simply carries it — every
// query runs as the token's owner under the same RLS as their browser would.
export async function createClient() {
  const bearer = bearerToken((await headers()).get("authorization"));
  if (bearer) {
    const client = createSbClient(
      supabaseUrl(),
      supabasePublishableKey(),
      {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
    // Every route asks `supabase.auth.getUser()` with no argument, which reads a
    // stored session — and this client stores none, so it would answer "no
    // user" and every agent call would 401. Default the argument to the bearer
    // token so existing routes need no changes.
    const getUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = (jwt?: string) => getUser(jwt ?? bearer);
    return client as unknown as ReturnType<typeof createServerClient>;
  }

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — the middleware refreshes cookies,
            // so this can be safely ignored.
          }
        },
      },
    },
  );
}
