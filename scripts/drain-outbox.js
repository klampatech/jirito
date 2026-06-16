/**
 * scripts/drain-outbox.js
 *
 * Scans webhook_outbox for pending rows and POSTs each to the bridge.
 * Successful POSTs get marked 'delivered'; failures bump attempts.
 * Rows with attempts >= 10 are marked 'dead' and skipped.
 * Designed to run as a no-agent cron job every minute.
 *
 * Uses sql.js (same as the server) to avoid adding a new dep.
 * WARNING: this script reads and writes the same .db file as the running
 * server. There is a potential race condition if the server saves while
 * this script is running. The script saves once at the end, minimizing
 * the window. See open question in the receipt.
 */

import initSqlJs from "sql.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = process.env.JIRITO_DB_PATH || join(process.cwd(), "jirito.db");
const BRIDGE_URL = process.env.JIRITO_WEBHOOK_BRIDGE_URL || "http://localhost:3030";
const BATCH_LIMIT = 20;

async function main() {
  // Load sql.js synchronously
  const SQL = await initSqlJs();

  let db;
  try {
    if (existsSync(DB_PATH)) {
      const data = readFileSync(DB_PATH);
      db = new SQL.Database(data);
    } else {
      console.log(JSON.stringify({ error: `Database file not found: ${DB_PATH}` }));
      process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({ error: `Failed to open database: ${err.message}` }));
    process.exit(1);
  }

  // Mark dead rows (attempts >= 10) before processing
  const deadResult = db.exec(
    `SELECT COUNT(*) FROM webhook_outbox WHERE status='pending' AND attempts >= 10`
  );
  const deadCount = deadResult.length > 0 ? Number(deadResult[0].values[0][0]) : 0;
  if (deadCount > 0) {
    db.run(
      `UPDATE webhook_outbox SET status='dead' WHERE status='pending' AND attempts >= 10`
    );
    console.log(JSON.stringify({ dead_marked: deadCount }));
  }

  // Fetch pending rows (up to BATCH_LIMIT)
  const result = db.exec(
    `SELECT id, event_id, event_type, payload, attempts
     FROM webhook_outbox
     WHERE status='pending' AND attempts < 10
     ORDER BY id ASC
     LIMIT ${BATCH_LIMIT}`
  );

  if (result.length === 0 || result[0].values.length === 0) {
    console.log(JSON.stringify({ drained: 0 }));
    db.close();
    process.exit(0);
  }

  const columns = result[0].columns;
  const rows = result[0].values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });

  let drained = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const { id, event_id, event_type, payload } = row;

    let httpStatus = null;
    let errorMsg = null;

    try {
      const res = await fetch(`${BRIDGE_URL}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(2000),
      });
      httpStatus = res.status;
      if (res.ok) {
        db.run(
          `UPDATE webhook_outbox
           SET status='delivered', delivered_at=datetime('now')
           WHERE id = ?`,
          [id]
        );
        console.log(JSON.stringify({ event_id, event_type, status: "delivered" }));
        drained++;
      } else {
        errorMsg = `HTTP ${httpStatus}`;
        db.run(
          `UPDATE webhook_outbox
           SET attempts=attempts+1, last_attempt_at=datetime('now'), last_error=?
           WHERE id = ?`,
          [errorMsg, id]
        );
        console.log(JSON.stringify({ event_id, event_type, status: "retry", error: errorMsg }));
      }
    } catch (err) {
      errorMsg = (err ?? {}).message || String(err);
      db.run(
        `UPDATE webhook_outbox
         SET attempts=attempts+1, last_attempt_at=datetime('now'), last_error=?
         WHERE id = ?`,
        [errorMsg, id]
      );
      console.log(JSON.stringify({ event_id, event_type, status: "retry", error: errorMsg }));
    }
  }

  // Persist changes to disk
  try {
    const data = db.export();
    writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.log(JSON.stringify({ error: `Failed to write database: ${err.message}` }));
    db.close();
    process.exit(1);
  }

  db.close();
  console.log(JSON.stringify({ drained }));
  process.exit(0);
}

main().catch((err) => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
