import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completePendingMerge } from "@/lib/pending-merge";

// Handles email links (password recovery, invites, email confirmation).
// Verifies the one-time token, establishes the session, then sends the user on.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/account/password";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // This is the exact moment email ownership was proven, so it's where a
      // deferred join-merge completes. No-op for every other kind of link.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await completePendingMerge(user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
