// Offline check-in queue.
//
// Sunday morning with 30 kids in line and flaky WiFi is the scenario that makes
// people abandon a check-in system. So a check-in never depends on the network:
// the security code is generated on the device, the badge prints immediately,
// and the row is queued locally until it can sync.
//
// localStorage (not IndexedDB) is deliberate — the payloads are tiny, and it's
// synchronous, so nothing is lost if the tab closes mid-write.

const KEY = "ah-checkin-queue";

export interface QueuedCheckin {
  /** Client-generated id — also the idempotency key, so a retry can't duplicate. */
  localId: string;
  profile_id: string;
  room_id: string | null;
  campus_id: string;
  security_code: string;
  checked_in_at: string;
  status: "checked_in";
  /** For rendering the roster while offline. */
  childName: string;
  hasAllergy: boolean;
  roomName: string;
  attempts: number;
}

function read(): QueuedCheckin[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as QueuedCheckin[];
  } catch {
    return [];
  }
}

function write(rows: QueuedCheckin[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // Storage full or blocked — nothing useful to do; the UI still shows the
    // badge that was printed.
  }
}

export function queueCheckin(row: Omit<QueuedCheckin, "attempts">) {
  write([...read(), { ...row, attempts: 0 }]);
}

export function pendingCheckins(): QueuedCheckin[] {
  return read();
}

export function pendingCount(): number {
  return read().length;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface FlushResult {
  synced: number;
  remaining: number;
  failed: number;
}

/**
 * Push queued check-ins to the server.
 *
 * Rows are sent one at a time so a single bad row (e.g. a child deleted in the
 * meantime) can't block the rest. A row that keeps failing is dropped after
 * several attempts rather than jamming the queue forever — the check-in already
 * happened physically; the record is best-effort at that point.
 */
export async function flushQueue(
  insert: (row: QueuedCheckin) => Promise<{ error?: { message: string } | null }>,
): Promise<FlushResult> {
  const rows = read();
  if (rows.length === 0) return { synced: 0, remaining: 0, failed: 0 };

  const stillQueued: QueuedCheckin[] = [];
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const { error } = await insert(row);
      if (!error) {
        synced++;
        continue;
      }
      // A duplicate means an earlier attempt actually landed — treat as synced.
      if (/duplicate|already exists/i.test(error.message)) {
        synced++;
        continue;
      }
      const attempts = row.attempts + 1;
      if (attempts >= 5) failed++;
      else stillQueued.push({ ...row, attempts });
    } catch {
      // Network still down — keep it, don't count as a failure.
      stillQueued.push(row);
    }
  }

  write(stillQueued);
  return { synced, remaining: stillQueued.length, failed };
}
