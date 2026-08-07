// Client-side helper for firing a push notification to someone.
//
// Fire-and-forget by design: a notification failing must never block the action
// that triggered it (sending a message, scheduling a volunteer).

export function notify(
  profileId: string | null | undefined,
  title: string,
  body: string,
  url = "/dashboard",
) {
  if (!profileId) return;
  void fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId, title, body, url }),
  }).catch(() => {});
}

/** Notify several people at once (e.g. everyone in a department chat). */
export function notifyMany(
  profileIds: string[],
  title: string,
  body: string,
  url = "/dashboard",
) {
  for (const id of profileIds) notify(id, title, body, url);
}

/** Trim a message for a notification body. */
export function preview(text: string, max = 120) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
