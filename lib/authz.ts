// Route-level authorization decisions, as pure functions.
//
// These guards used to live inline in each API route, which is how the IT
// help-desk reset ended up a Super_Admin-takeover: a second reset route was
// written without the target-role check the first one had. A pure function
// imported by every route makes that class of bug structural — there is one
// decision, it is unit-tested exhaustively (tests/authz.test.mjs), and a new
// route that forgets to call it fails review, not production.
//
// Everything here is pure: no DB, no Supabase, no request. The routes fetch the
// facts (roles, ownership, membership) and ask these functions the yes/no.

export type Role =
  | "Super_Admin"
  | "Admin"
  | "IT_Admin"
  | "Staff"
  | "Volunteer"
  | "Member"
  | string; // tolerate unknown/legacy strings — they are treated as unprivileged

/**
 * The rungs a help-desk unlock must never reach. Resetting one of these is an
 * account takeover (the recovery link is handed back when email is unconfigured),
 * so only a Super_Admin may do it. Admin = Apostle/Pastor (0059); it joined the
 * privileged set after the original guard was written, which is why it must be
 * named here rather than assumed.
 */
export const PRIVILEGED_ROLES: readonly Role[] = ["Super_Admin", "Admin", "IT_Admin"];

export function isPrivilegedRole(role: Role | null | undefined): boolean {
  return !!role && PRIVILEGED_ROLES.includes(role);
}

/**
 * May a caller trigger a password reset for a target account?
 *
 * A Super_Admin may reset anyone. Everyone else (IT_Admin, or an IT-department
 * member acting as help desk) may reset only UNPRIVILEGED accounts — never a
 * Super_Admin, Admin, or another IT_Admin. Used by BOTH reset routes so they
 * cannot drift apart.
 */
export function canResetPasswordFor(
  callerRole: Role | null | undefined,
  targetRole: Role | null | undefined,
): boolean {
  if (callerRole === "Super_Admin") return true;
  return !isPrivilegedRole(targetRole);
}

/**
 * Roles that may send a push notification to ANYONE. A push lands on a lock
 * screen with whatever title we are handed, so an open notify endpoint is an
 * impersonation channel — this is the role gate before the (narrower)
 * shared-channel and department-lead checks the route also applies.
 */
export const BROADCAST_NOTIFY_ROLES: readonly Role[] = [
  "Super_Admin",
  "Admin",
  "IT_Admin",
  "Staff",
];

export function canNotifyAnyone(role: Role | null | undefined): boolean {
  return !!role && BROADCAST_NOTIFY_ROLES.includes(role);
}

/**
 * May a caller (re)claim a push subscription endpoint for their own profile?
 *
 * An endpoint is a capability URL. Claiming an UNOWNED one is fine (first
 * registration, or a rotation of your own). Claiming one that already belongs
 * to someone else would silently redirect their device's notifications to you —
 * so that is refused. Holding the URL must not transfer it.
 */
export function mayClaimPushEndpoint(
  currentOwnerProfileId: string | null | undefined,
  callerProfileId: string,
): boolean {
  if (!callerProfileId) return false;
  if (!currentOwnerProfileId) return true; // unclaimed
  return currentOwnerProfileId === callerProfileId;
}

/**
 * Is this R2 object key channel-scoped, so serving it must be gated on the
 * caller being able to see the owning message? Message attachments live under
 * messages/<channelId>/…; photos (profiles/…) are church-wide readable by
 * design (0049) and are NOT gated.
 */
export function isChannelScopedFileKey(key: string): boolean {
  return key.startsWith("messages/");
}
