import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signSsoCode } from "@/lib/sso-code";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

// Hand the signed-in identity to the IT portal.
//
// Runs server-side: reads the session from cookies, mints a 60-second signed
// code asserting only "this email is authenticated here", then sends the browser
// on with a plain GET. No token in the URL, no cross-origin cookie, no reliance
// on client JS — the previous three attempts each failed on one of those.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const secret = process.env.SSO_SHARED_SECRET;
  if (!user?.email || !secret) {
    // Not signed in, or SSO isn't configured — let the portal ask for a login.
    return NextResponse.redirect(IT_PORTAL);
  }

  const code = await signSsoCode(user.email, secret);
  return NextResponse.redirect(
    `${IT_PORTAL}/api/auth/sso-code?c=${encodeURIComponent(code)}`,
  );
}
