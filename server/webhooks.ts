/**
 * Webhook emitter — durable outbox + fire-and-forget POST to bridge.
 *
 * Every write path (issues, comments) calls emitEvent() after saveDb().
 * Events land in webhook_outbox with status='pending'. postToBridge()
 * fires the POST non-blocking; on 2xx it updates status='delivered'.
 */

import { randomUUID } from "node:crypto";
import { getDb, saveDb } from "./db/index.js";

const BRIDGE_URL =
  process.env.JIRITO_WEBHOOK_BRIDGE_URL || "http://localhost:3030";
const ENABLED = process.env.JIRITO_WEBHOOK_ENABLED !== "false";

/**
 * Emit a webhook event. Inserts a row into webhook_outbox and fires
 * a fire-and-forget POST to the bridge. Does not block the caller.
 */
export async function emitEvent(
  event_type: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!ENABLED) {
    console.log(`[webhook] disabled, skipping ${event_type}`);
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
    // Fire-and-forget POST — do not await
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
