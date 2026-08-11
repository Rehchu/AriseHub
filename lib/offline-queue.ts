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

/** Attempts after which a row stops being retried — but is never deleted. */
const MAX_ATTEMPTS = 5;

export interface QueuedCheckin {
  /** Client-generated id, sent as checkins.local_id — the idempotency key. */
  localId: string;
  profile_id: string;
  room_id: string | null;
  campus_id: string;
  security_code: string;
  checked_in_at: string;
  status: "checked_in";
  /** Who was on the desk. Was omitted, leaving offline rows unattributed. */
  checked_in_by: string | null;
  /** For rendering the roster while offline. */
  childName: string;
  hasAllergy: boolean;
  roomName: string;
  /** Did this device already print the badge (printer stations do; check-in
   *  tablets don't)? Carried so the row lands with the right printed state and
   *  a print station's auto-print doesn't reprint what already came out. */
  printed?: boolean;
  attempts: number;
  /** Set once a row has exhausted MAX_ATTEMPTS. Kept, not dropped. */
  stuck?: boolean;
  /** Why it is stuck, so someone can act on it rather than guess. */
  lastError?: string;
}

function read(): QueuedCheckin[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as QueuedCheckin[];
  } catch {
    return [];
  }
}

function write(rows: QueuedCheckin[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch {
    // Quota exceeded or storage blocked. The caller needs to know: the badge
    // has already printed, so silently dropping means a child is physically
    // checked in with no record anywhere.
    return false;
  }
}

/** @returns false when the queue could not be persisted. */
export function queueCheckin(row: Omit<QueuedCheckin, "attempts">): boolean {
  return write([...read(), { ...row, attempts: 0 }]);
}

export function pendingCheckins(): QueuedCheckin[] {
  return read();
}

export function pendingCount(): number {
  return read().filter((r) => !r.stuck).length;
}

/** Rows that have given up and need a human. */
export function stuckCheckins(): QueuedCheckin[] {
  return read().filter((r) => r.stuck);
}

/** Remove one stuck row once it has been dealt with by hand. */
export function discardStuck(localId: string) {
  write(read().filter((r) => r.localId !== localId));
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface FlushResult {
  synced: number;
  remaining: number;
  /** Rows that have stopped retrying and are waiting on a person. */
  stuck: number;
  /** True when another flush was already running and this one did nothing. */
  skipped?: boolean;
}

/** Guards against two flushes overlapping — see the note in flushQueue. */
let flushing = false;

const isDuplicate = (msg: string) =>
  /duplicate key|already exists|violates unique constraint/i.test(msg);

/**
 * Push queued check-ins to the server.
 *
 * Two bugs this had, both of which lose child-safety records:
 *
 * LOST WRITES. It read the queue at the start and overwrote the whole key at
 * the end with what was left. Any check-in queued while the flush was awaiting
 * the network — i.e. exactly when a volunteer keeps working through a slow
 * sync — was silently erased. It now re-reads at the end and removes only the
 * rows it actually handled, so anything added meanwhile survives. The `flushing`
 * guard stops two overlapping flushes racing the same way.
 *
 * SILENT DELETION. A row that failed five times was dropped, and the count was
 * returned but never shown. A check-in is an attendance record for a child;
 * deleting it because the network misbehaved is the wrong trade. Stuck rows are
 * now kept, stop being retried, and are surfaced for someone to resolve.
 *
 * Rows are sent one at a time so a single bad row can't block the rest.
 */
export async function flushQueue(
  insert: (row: QueuedCheckin) => Promise<{ error?: { message: string } | null }>,
): Promise<FlushResult> {
  if (flushing) return { synced: 0, remaining: pendingCount(), stuck: stuckCheckins().length, skipped: true };
  flushing = true;
  try {
    const batch = read().filter((r) => !r.stuck);
    if (batch.length === 0) {
      return { synced: 0, remaining: 0, stuck: stuckCheckins().length };
    }

    const done = new Set<string>();
    const bumped = new Map<string, { attempts: number; stuck: boolean; lastError: string }>();
    let synced = 0;

    for (const row of batch) {
      try {
        const { error } = await insert(row);
        if (!error) {
          done.add(row.localId);
          synced++;
          continue;
        }
        // A duplicate proves an earlier attempt actually landed. This can only
        // fire now that local_id is sent and uniquely indexed (migration 0047).
        if (isDuplicate(error.message)) {
          done.add(row.localId);
          synced++;
          continue;
        }
        const attempts = row.attempts + 1;
        bumped.set(row.localId, {
          attempts,
          stuck: attempts >= MAX_ATTEMPTS,
          lastError: error.message,
        });
      } catch {
        // Still offline. Not the row's fault, so don't count it against it.
      }
    }

    // Re-read rather than reusing `batch`: rows queued during the awaits above
    // are in storage now and must not be clobbered.
    const current = read();
    const next = current
      .filter((r) => !done.has(r.localId))
      .map((r) => {
        const b = bumped.get(r.localId);
        return b ? { ...r, attempts: b.attempts, stuck: b.stuck, lastError: b.lastError } : r;
      });
    write(next);

    return {
      synced,
      remaining: next.filter((r) => !r.stuck).length,
      stuck: next.filter((r) => r.stuck).length,
    };
  } finally {
    flushing = false;
  }
}
