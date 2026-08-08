// The offline check-in queue.
//
// This runs on flaky church WiFi with a queue of parents waiting, and every bug
// it had lost a child's attendance record. No database needed — it is pure
// logic over localStorage, so these always run.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage before importing the module under test.
class MemoryStorage {
  #data = new Map();
  #failWrites = false;
  failWrites(on) {
    this.#failWrites = on;
  }
  getItem(k) {
    return this.#data.has(k) ? this.#data.get(k) : null;
  }
  setItem(k, v) {
    if (this.#failWrites) throw new Error("QuotaExceededError");
    this.#data.set(k, String(v));
  }
  removeItem(k) {
    this.#data.delete(k);
  }
  clear() {
    this.#data.clear();
  }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;
// navigator is read-only in Node 24 and isn't needed — nothing here calls
// isOffline(), which is the only consumer.

const {
  queueCheckin,
  pendingCount,
  pendingCheckins,
  stuckCheckins,
  discardStuck,
  flushQueue,
} = await import("../lib/offline-queue.ts");

let n = 0;
const row = (name = "Kid") => ({
  localId: `local-${++n}`,
  profile_id: "p1",
  room_id: "r1",
  campus_id: "c1",
  security_code: "ABC123",
  checked_in_at: new Date().toISOString(),
  status: "checked_in",
  checked_in_by: "vol-1",
  childName: name,
  hasAllergy: false,
  roomName: "Nursery",
});

beforeEach(() => {
  storage.clear();
  storage.failWrites(false);
});

describe("queueing", () => {
  test("a queued check-in is retained and counted", () => {
    assert.equal(queueCheckin(row("Amy")), true);
    assert.equal(pendingCount(), 1);
    assert.equal(pendingCheckins()[0].childName, "Amy");
  });

  test("carries who was on the desk", () => {
    queueCheckin(row());
    assert.equal(pendingCheckins()[0].checked_in_by, "vol-1");
  });

  test("reports failure when storage is full instead of pretending", async () => {
    // The badge has already printed by this point, so a silent failure means a
    // child is physically checked in with no record anywhere.
    storage.failWrites(true);
    assert.equal(queueCheckin(row()), false);
  });
});

describe("flushing", () => {
  test("a check-in queued DURING a flush is not lost", async () => {
    queueCheckin(row("First"));

    // The insert takes a moment, and a volunteer keeps working meanwhile —
    // which is precisely when the old read-all/write-all clobbered the new row.
    const res = await flushQueue(async () => {
      queueCheckin(row("QueuedMidFlush"));
      await new Promise((r) => setTimeout(r, 10));
      return { error: null };
    });

    assert.equal(res.synced, 1);
    const left = pendingCheckins();
    assert.equal(left.length, 1, "the check-in added during the flush was erased");
    assert.equal(left[0].childName, "QueuedMidFlush");
  });

  test("a duplicate means an earlier attempt landed, so it counts as synced", async () => {
    queueCheckin(row());
    const res = await flushQueue(async () => ({
      error: { message: 'duplicate key value violates unique constraint "checkins_local_id_uidx"' },
    }));
    assert.equal(res.synced, 1);
    assert.equal(pendingCount(), 0, "a row already on the server stayed queued");
  });

  test("a network throw leaves the row alone, without counting a failure", async () => {
    queueCheckin(row());
    const res = await flushQueue(async () => {
      throw new Error("Failed to fetch");
    });
    assert.equal(res.synced, 0);
    assert.equal(res.remaining, 1);
    assert.equal(pendingCheckins()[0].attempts, 0, "being offline was blamed on the row");
  });

  test("a row that keeps failing sticks, and is never deleted", async () => {
    queueCheckin(row("Persistent"));
    for (let i = 0; i < 6; i++) {
      await flushQueue(async () => ({ error: { message: "some server error" } }));
    }
    assert.equal(pendingCount(), 0, "it should stop being retried");
    const s = stuckCheckins();
    assert.equal(s.length, 1, "a child's attendance record was deleted");
    assert.equal(s[0].childName, "Persistent");
    assert.match(s[0].lastError, /some server error/);
  });

  test("a stuck row can be cleared deliberately", async () => {
    queueCheckin(row());
    for (let i = 0; i < 6; i++) {
      await flushQueue(async () => ({ error: { message: "boom" } }));
    }
    discardStuck(stuckCheckins()[0].localId);
    assert.equal(stuckCheckins().length, 0);
  });

  test("overlapping flushes don't race each other", async () => {
    queueCheckin(row());
    let concurrent = 0;
    let maxConcurrent = 0;
    const insert = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
      return { error: null };
    };
    const [a, b] = await Promise.all([flushQueue(insert), flushQueue(insert)]);
    assert.equal(maxConcurrent, 1, "two flushes ran at once and can clobber each other");
    assert.ok(a.skipped || b.skipped, "the second flush should have backed off");
  });

  test("an empty queue is a no-op", async () => {
    const res = await flushQueue(async () => {
      throw new Error("should not be called");
    });
    assert.deepEqual({ synced: res.synced, remaining: res.remaining }, { synced: 0, remaining: 0 });
  });

  test("one bad row does not block the others", async () => {
    queueCheckin(row("Good1"));
    queueCheckin(row("Bad"));
    queueCheckin(row("Good2"));
    const res = await flushQueue(async (r) =>
      r.childName === "Bad" ? { error: { message: "nope" } } : { error: null },
    );
    assert.equal(res.synced, 2);
    assert.equal(res.remaining, 1);
    assert.equal(pendingCheckins()[0].childName, "Bad");
  });
});
