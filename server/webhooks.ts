/**
 * Webhook emitter — durable outbox + fire-and-forget POST to bridge.
 *
 * Every write path (issues, comments) calls emitEvent() after saveDb().
 * Events land in webhook_outbox with status='pending'. postToBridge()
 * fires the POST non-blocking; on 2xx it updates status='delivered'.
 *
 * The outbox worker (startOutboxWorker) is the durability backstop:
 * if postToBridge fails (bridge down, network blip, jirito killed
 * mid-promise), the worker polls every 5s for pending rows and re-POSTs
 * them. Without the worker, events that fail to deliver sit in
 * `status='pending'` forever — the C5 test (jirito-squad integration
 * 2026-06-18) observed 6 stuck events after a few test runs before
 * the worker shipped.
 */

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { getDb, saveDb } from "./db/index.js";

const BRIDGE_URL =
  process.env.JIRITO_WEBHOOK_BRIDGE_URL || "http://localhost:3030";
const ENABLED = process.env.JIRITO_WEBHOOK_ENABLED !== "false";

/**
 * Per-request "silent" flag, set when the inbound request carries
 * `X-Jirito-Silent: 1`. Lets the Playwright suite seed fixtures without
 * spamming Discord — `emitEvent` and `broadcastEvent` both early-return
 * when this is set, so the outbox is not even written.
 *
 * AsyncLocalStorage (not a module-level boolean) because the server
 * interleaves concurrent requests at every `await`. A module-level
 * flag would corrupt across requests when one request is mid-handler
 * and another's middleware runs.
 */
const silentStorage = new AsyncLocalStorage<{ silent: boolean }>();

/** True iff the currently-executing request is marked silent. */
export function isSilentRequest(): boolean {
  return silentStorage.getStore()?.silent === true;
}

/**
 * Run `fn` inside a silent request context. The dispatcher in
 * server/index.ts wraps each inbound HTTP request in this when the
 * request carries `X-Jirito-Silent: 1`; emitEvent and broadcastEvent
 * then early-return for the duration of the handler.
 *
 * Exported (not just the storage) so the wrapper itself is the
 * public API — callers shouldn't reach into AsyncLocalStorage
 * directly.
 */
export function runSilent<T>(fn: () => T): T {
  return silentStorage.run({ silent: true }, fn);
}

/**
 * Emit a webhook event. Inserts a row into webhook_outbox and fires
 * a fire-and-forget POST to the bridge. Does not block the caller.
 *
 * Delivery durability is provided by the outbox worker: even if the
 * fire-and-forget POST here fails (e.g., bridge down), the row is in
 * the outbox and the worker will retry it.
 */
export async function emitEvent(
  event_type: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!ENABLED) {
    console.log(`[webhook] disabled, skipping ${event_type}`);
    return;
  }
  // Test fixture writes set X-Jirito-Silent so the squad wiretap
  // doesn't get 6 ticket.created events per `beforeEach` × every test
  // (50+ tests = 300+ events per suite run). The outbox row is also
  // skipped — leaving it would just queue phantom events for the
  // worker to retry.
  if (isSilentRequest()) {
    return;
  }
  const db = getDb();
  if (!db) return;
  const event_id = randomUUID();
  const envelope = {
    event_id,
    event_type,
    timestamp: new Date().toISOString(),
    source: "jirito",
    payload,
  };
  try {
    db.run(
      `INSERT INTO webhook_outbox (event_id, event_type, payload, status)
       VALUES (?, ?, ?, 'pending')`,
      [event_id, event_type, JSON.stringify(envelope)]
    );
    await saveDb();
    // Fire-and-forget POST — do not await. If this fails, the row
    // stays `pending` and the outbox worker picks it up.
    void postToBridge(event_id, envelope);
  } catch (err) {
    console.error(`[webhook] outbox insert failed for ${event_type}:`, err);
  }
}

async function postToBridge(event_id: string, envelope: object): Promise<void> {
  try {
    const res = await fetch(`${BRIDGE_URL}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const db = getDb();
      if (db) {
        db.run(
          `UPDATE webhook_outbox
           SET status='delivered', delivered_at=datetime('now')
           WHERE event_id = ?`,
          [event_id]
        );
        await saveDb();
      }
    } else {
      console.warn(`[webhook] bridge returned ${res.status} for ${event_id}`);
    }
  } catch (err) {
    console.warn(`[webhook] POST failed for ${event_id}:`, (err as Error).message);
  }
}

// ─── OUTBOX RETRY WORKER ────────────────────────────────────────────
//
// C5 (jirito-squad integration test 2026-06-18) found that the
// fire-and-forget `void postToBridge(event_id, envelope)` left events
// in `status='pending'` forever when the bridge was down or jirito
// was killed mid-POST. This worker is the durability backstop: it
// polls the outbox on a fixed interval and re-POSTs any row that is
// still `pending` and past its backoff window.
//
// Design choices:
//
// 1. **Fixed 5s backoff** (not exponential). Simpler SQL, bounded
//    retry rate. A flapping bridge hits MAX_ATTEMPTS=10 in ~50s and
//    gives up — that's fine, the operator can manually re-arm.
//
// 2. **Per-row `last_attempt_at` tracking**. Each retry updates this
//    so we can see in the outbox when the row was last tried and
//    with what error (`last_error` column). The audit log shows
//    `attempts` and `last_error` for diagnosis.
//
// 3. **Bounded batch (100 rows per tick)**. Prevents the worker from
//    monopolizing the event loop on a huge backlog. With a 5s poll
//    interval, max throughput is 100 rows / 5s = 20 rows/s — more
//    than enough for normal traffic (C4 sends 5 tickets/2.5s = 2/s).
//
// 4. **Bypass worker's own backoff on startup** (the initial `setTimeout`).
//    Drains any backlog that piled up while jirito was down so the
//    chain doesn't take 5s to recover.
//
// 5. **Idempotent start (`outboxWorkerStarted` flag)**. Multiple
//    `startOutboxWorker()` calls are no-ops; the second one would
//    start a second setInterval otherwise.
//
// 6. **No ops on success beyond `delivered`**. The same UPDATE that
//    postToBridge does. Failed rows are left in `pending` with
//    `attempts` incremented; once `attempts >= MAX_ATTEMPTS`, the
//    worker stops picking them up and an operator must intervene.

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 10;
const FIXED_BACKOFF_SEC = 5;

let outboxWorkerStarted = false;

/**
 * Start the background outbox drain worker. Idempotent — calling more
 * than once is a no-op.
 *
 * Call from `server/index.ts` `start()` after `initTables()` returns.
 * The worker exits with the process (setInterval doesn't need a
 * cleanup handler — SIGINT/SIGTERM in `index.ts` calls
 * `process.exit(0)` which terminates the timers).
 */
export function startOutboxWorker(): void {
  if (outboxWorkerStarted) return;
  outboxWorkerStarted = true;

  console.log(
    `[webhook] outbox worker started (poll ${POLL_INTERVAL_MS / 1000}s, ` +
      `batch ${BATCH_SIZE}, max ${MAX_ATTEMPTS} attempts, ` +
      `fixed backoff ${FIXED_BACKOFF_SEC}s)`
  );

  const tick = async (): Promise<void> => {
    const db = getDb();
    if (!db) return;

    let result: Awaited<ReturnType<typeof db.exec>>;
    try {
      result = db.exec(
        `SELECT id, event_id, payload, attempts FROM webhook_outbox
         WHERE status = 'pending'
           AND attempts < ?
           AND (last_attempt_at IS NULL
                OR last_attempt_at < datetime('now', '-' || ? || ' seconds'))
         ORDER BY created_at ASC
         LIMIT ?`,
        [MAX_ATTEMPTS, FIXED_BACKOFF_SEC, BATCH_SIZE]
      );
    } catch (err) {
      console.error("[webhook] outbox worker query failed:", err);
      return;
    }

    if (result.length === 0 || result[0].values.length === 0) {
      return; // nothing due for retry
    }

    const { columns, values } = result[0];
    const idIdx = columns.indexOf("id");
    const eventIdIdx = columns.indexOf("event_id");
    const payloadIdx = columns.indexOf("payload");
    const attemptsIdx = columns.indexOf("attempts");

    for (const row of values) {
      const id = String(row[idIdx]);
      const event_id = String(row[eventIdIdx]);
      const payloadStr = String(row[payloadIdx]);
      const attempts = Number(row[attemptsIdx]);

      let envelope: unknown;
      try {
        envelope = JSON.parse(payloadStr);
      } catch {
        console.warn(
          `[webhook] outbox row ${id} has invalid JSON payload, marking failed`
        );
        db.run(
          `UPDATE webhook_outbox
           SET attempts = attempts + 1,
               last_attempt_at = datetime('now'),
               last_error = 'invalid JSON payload'
           WHERE id = ?`,
          [id]
        );
        await saveDb();
        continue;
      }

      // Re-POST to the bridge. We re-serialize the stored payload
      // (preserves the original envelope shape — same event_id,
      // timestamp, etc.) rather than mutating it.
      try {
        const res = await fetch(`${BRIDGE_URL}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payloadStr,
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          db.run(
            `UPDATE webhook_outbox
             SET status = 'delivered', delivered_at = datetime('now')
             WHERE id = ?`,
            [id]
          );
          await saveDb();
          console.log(
            `[webhook] outbox retry delivered ${event_id} ` +
              `(was pending, attempts was ${attempts})`
          );
        } else {
          const body = await res.text().catch(() => "");
          const errMsg = `bridge returned ${res.status}: ${body.slice(0, 200)}`;
          db.run(
            `UPDATE webhook_outbox
             SET attempts = attempts + 1,
                 last_attempt_at = datetime('now'),
                 last_error = ?
             WHERE id = ?`,
            [errMsg, id]
          );
          await saveDb();
        }
      } catch (err) {
        const errMsg = (err as Error).message.slice(0, 200);
        db.run(
          `UPDATE webhook_outbox
           SET attempts = attempts + 1,
               last_attempt_at = datetime('now'),
               last_error = ?
           WHERE id = ?`,
          [errMsg, id]
        );
        await saveDb();
      }
    }
  };

  // Schedule recurring ticks
  setInterval(() => void tick(), POLL_INTERVAL_MS);
  // Drain backlog on startup (1s grace so initDb/initTables finish
  // any async work; tests that just restarted jirito may have
  // hundreds of pending events from the previous run)
  setTimeout(() => void tick(), 1_000);
}
