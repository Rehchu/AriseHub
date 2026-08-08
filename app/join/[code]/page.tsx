import { createAdminClient } from "@/lib/supabase/admin";
import { JoinForm } from "@/components/join/JoinForm";
import { Logo } from "@/components/Logo";

// Public registration page reached only via a shared invite link.
// The code is validated server-side with the service role — the anon key has no
// read access to invite_links, so a visitor can't discover or test codes.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("invite_links")
    .select("label, active, expires_at, max_uses, uses, campuses(name)")
    .eq("code", code)
    .maybeSingle();

  const l = data as {
    label: string;
    active: boolean;
    expires_at: string | null;
    max_uses: number | null;
    uses: number;
    campuses: { name: string } | { name: string }[] | null;
  } | null;

  const valid =
    !!l &&
    l.active &&
    (!l.expires_at || new Date(l.expires_at) > new Date()) &&
    (l.max_uses == null || l.uses < l.max_uses);

  const campus = Array.isArray(l?.campuses) ? l?.campuses[0] : l?.campuses;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink-900 px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-3 text-onaccent">
        <Logo size={52} />
        <h1 className="font-display text-2xl font-bold">
          Arise<span className="text-brand-500">Hub</span>
        </h1>
        <p className="text-sm text-ink-300">Arise Church · Pineville, LA</p>
      </div>

      <div className="w-full max-w-sm">
        {valid ? (
          <JoinForm code={code} label={l!.label} campusName={campus?.name ?? null} />
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="font-display text-lg font-bold text-ink-900">
              This invite link isn&apos;t active
            </h2>
            <p className="mt-2 text-sm text-ink-500">
              It may have expired or been turned off. Ask your department leader for
              a new link.
            </p>
            <a
              href="/login"
              className="mt-5 inline-block rounded-lg bg-ink-100 px-4 py-2 text-sm font-medium text-ink-700"
            >
              Already have an account? Sign in
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
