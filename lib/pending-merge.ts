import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

// Completes a deferred profile merge once the person has PROVEN they own the
// email — never before.
//
// Self-registration (app/api/join) used to merge a new signup straight onto a
// pre-existing member record whenever the email matched. Nothing proved the
// registrant controlled that mailbox, so anyone with an invite link could type
// a congregant's address and inherit their profile — including, on a children's
// check-in app, that person's guardian↔child pickup links.
//
// Now, when the join endpoint sees a match, it does NOT merge. It creates the
// account UNCONFIRMED and stashes the intended merge in user_metadata. Supabase
// sets email_confirmed_at only after the person clicks the link sent to that
// address — so email_confirmed_at IS the proof. This runs at that moment (from
// the confirm route, with the layout as a backstop) and never otherwise.
//
// An attacker who signs up with someone else's email gets an unconfirmed
// account they cannot log into and a merge that can never fire.
export async function completePendingMerge(
  user: Pick<User, "id" | "email" | "email_confirmed_at" | "user_metadata">,
): Promise<{ merged: boolean }> {
  const meta = (user.user_metadata ?? {}) as {
    pending_merge_profile_id?: string;
    merge_role?: string;
    merge_campus_id?: string | null;
    merge_department_ids?: string[];
    full_name?: string;
  };
  const orphanId = meta.pending_merge_profile_id;
  // No pending merge → the overwhelmingly common case; do nothing, touch nothing.
  if (!orphanId) return { merged: false };
  // The gate. email_confirmed_at is set only by clicking the emailed link.
  if (!user.email_confirmed_at) return { merged: false };

  const admin = createAdminClient();
  const email = (user.email ?? "").trim().toLowerCase();

  try {
    // The orphan must still be unclaimed AND still carry this exact email — a
    // second guard so a stale or swapped metadata id can't point the merge at
    // someone else's record.
    const { data: orphanRow } = await admin
      .from("profiles")
      .select("id, user_id, email, full_name")
      .eq("id", orphanId)
      .maybeSingle();
    const orphan = orphanRow as
      | { id: string; user_id: string | null; email: string | null; full_name: string }
      | null;

    const stillMergeable =
      orphan &&
      orphan.user_id === null &&
      (orphan.email ?? "").trim().toLowerCase() === email &&
      email.length > 0;

    if (stillMergeable) {
      // profiles.user_id is UNIQUE, so the trigger-created row must release the
      // id before the orphan can take it. The fresh row is seconds old and has
      // nothing referencing it; the orphan carries the history.
      const { data: freshRow } = await admin
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const freshId = (freshRow as { id: string } | null)?.id ?? null;
      if (freshId && freshId !== orphan.id) {
        await admin.from("profiles").delete().eq("id", freshId);
      }

      await admin
        .from("profiles")
        .update({
          user_id: user.id,
          role: meta.merge_role ?? undefined,
          campus_id: meta.merge_campus_id ?? undefined,
          ...(meta.full_name ? { full_name: meta.full_name } : {}),
        })
        .eq("id", orphan.id);

      if (meta.merge_department_ids?.length) {
        await admin.from("department_members").upsert(
          meta.merge_department_ids.map((department_id) => ({
            department_id,
            profile_id: orphan.id,
          })),
          { onConflict: "department_id,profile_id" },
        );
      }
    }

    // Clear the flag whether we merged or found it already claimed — either way
    // there is nothing left to do, and it must never run twice.
    const nextMeta = { ...meta };
    delete nextMeta.pending_merge_profile_id;
    delete nextMeta.merge_role;
    delete nextMeta.merge_campus_id;
    delete nextMeta.merge_department_ids;
    await admin.auth.admin.updateUserById(user.id, { user_metadata: nextMeta });

    return { merged: !!stillMergeable };
  } catch {
    // Never break a page load over this — the backstop retries on the next one.
    return { merged: false };
  }
}
