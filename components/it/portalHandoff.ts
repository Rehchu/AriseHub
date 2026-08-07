export const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

/**
 * Open the IT portal signed in.
 *
 * Just a navigation to our own /it-launch route, which mints a short-lived
 * signed code server-side and forwards on. Everything clever happens on the
 * server precisely because every client-side mechanism was blocked.
 */
export async function openITPortal(): Promise<void> {
  window.location.href = "/it-launch";
}
