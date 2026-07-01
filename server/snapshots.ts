/**
 * State-snapshot safety net for jirito.
 *
 * Auto-captures the full application state to disk before every destructive
 * `PUT /api/state` so a bad payload can always be recovered via
 * `POST /api/state/restore/:id`. Inspired by the 2026-07-01 incident where
 * Evo accidentally wiped the live DB twice in one session by using
 * `PUT /api/state` as a cleanup shortcut.
 *
 * Snapshot storage:
 *   - JSON payload at ~/.hermes/state-snapshots/jirito-<timestamp>.json
 *   - Metadata row in the `state_snapshots` SQLite table for listing
 *
 * Capacity: capped at MAX_SNAPSHOTS (default 20). Oldest pruned on insert.
 *
 * Trade-offs:
 *   - We capture BEFORE the DELETE block runs, so if the server crashes
 *     mid-PUT the worst case is the previous PUT's payload is restored,
 *     not empty data.
 *   - Snapshots are cheap (~10-50 KB each). 20 * 50 KB = 1 MB. Fine.
 *   - Restore re-runs setState, so it goes through the same diff-and-emit
 *     path as a normal PUT. That means restoring an old state will fire
 *     ticket.* events for every ticket that reappears — by design, the
 *     squad wake pipeline should know the state was reset.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getDb, saveDb } from "./db/index.js";
import { sendJson } from "./routes/_shared.js";
import type { ServerResponse } from "node:http";
import { setState, getState } from "./routes/state.js";
import type { IncomingMessage } from "node:http";

const MAX_SNAPSHOTS = 20;
const SNAPSHOT_DIR = join(homedir(), ".hermes", "state-snapshots");

/** Ensure the snapshot directory exists. Idempotent. */
function ensureDir(): void {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

/**
 * Ensure the state_snapshots SQLite table exists. Called lazily from
 * captureSnapshot/restore so a freshly-init'd DB doesn't need a separate
 * migration.
 */
function ensureTable(): void {
  const db = getDb();
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS state_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      reason TEXT NOT NULL,
      path TEXT NOT NULL,
      projects INTEGER NOT NULL,
      issues INTEGER NOT NULL,
      columns INTEGER NOT NULL,
      comments INTEGER NOT NULL,
      bytes INTEGER NOT NULL
    )
  `);
}

/**
 * Capture the current full state to disk. Call this BEFORE any destructive
 * operation (currently: `setState`'s DELETE block).
 *
 * @param reason Short label written to the snapshot index, e.g.
 *               "pre-setState" or "pre-import".
 * @returns The new snapshot id, or null if capture failed (we never throw —
 *          a snapshot failure must never block the caller's PUT).
 */
export function captureSnapshot(reason: string): number | null {
  try {
    ensureDir();
    ensureTable();
    const db = getDb();
    if (!db) return null;

    // Pull the same payload getState returns — single source of truth.
    // We re-implement the SELECTs here rather than calling getState because
    // getState writes an HTTP response, which we don't want mid-snapshot.
    const projects = db.exec("SELECT COUNT(*) FROM projects")[0]?.values[0]?.[0] ?? 0;
    const issues = db.exec("SELECT COUNT(*) FROM issues")[0]?.values[0]?.[0] ?? 0;
    const columns = db.exec("SELECT COUNT(*) FROM columns")[0]?.values[0]?.[0] ?? 0;
    const comments = db.exec("SELECT COUNT(*) FROM comments")[0]?.values[0]?.[0] ?? 0;

    // Build the full snapshot payload by calling a private helper. We
    // call getState against a mocked response to extract the JSON it
    // would have written. Cheaper than reimplementing the SELECTs.
    const captured = buildSnapshotPayload();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `jirito-${timestamp}-${Math.random().toString(36).slice(2, 8)}.json`;
    const fullPath = join(SNAPSHOT_DIR, filename);
    const json = JSON.stringify(captured, null, 2);
    writeFileSync(fullPath, json, "utf8");

    const bytes = Buffer.byteLength(json, "utf8");
    db.run(
      `INSERT INTO state_snapshots (timestamp, reason, path, projects, issues, columns, comments, bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        new Date().toISOString(),
        reason,
        fullPath,
        Number(projects),
        Number(issues),
        Number(columns),
        Number(comments),
        bytes,
      ]
    );

    pruneOldSnapshots();

    // Return the new snapshot id
    const idRow = db.exec("SELECT last_insert_rowid()");
    const id = Number(idRow[0]?.values[0]?.[0] ?? 0);
    console.log(
      `[snapshot] captured #${id} (${reason}): ${projects}p/${issues}i/${columns}c/${comments}cm @ ${bytes}B`
    );
    return id;
  } catch (err) {
    // Never block the caller's operation on a snapshot failure.
    console.error("[snapshot] capture failed:", (err as Error).message);
    return null;
  }
}

/**
 * Build the full state payload by calling getState against a fake response
 * object and extracting the body it would have written.
 */
function buildSnapshotPayload(): Record<string, unknown> {
  let captured: Record<string, unknown> = {};
  const fakeRes = {
    writeHead: () => undefined,
    setHeader: () => undefined,
    end: (body: string) => {
      try {
        captured = JSON.parse(body);
      } catch {
        captured = {};
      }
    },
  } as unknown as ServerResponse;
  void getState({} as IncomingMessage, fakeRes);
  return captured;
}

/**
 * Cap the snapshot index at MAX_SNAPSHOTS entries. Delete the oldest
 * by both file (rm) and DB row.
 */
function pruneOldSnapshots(): void {
  try {
    const db = getDb();
    if (!db) return;
    const rows = db.exec(
      `SELECT id, path FROM state_snapshots ORDER BY id DESC`
    );
    const entries: Array<{ id: number; path: string }> = [];
    for (const row of rows[0]?.values ?? []) {
      entries.push({ id: Number(row[0]), path: String(row[1]) });
    }
    if (entries.length <= MAX_SNAPSHOTS) return;
    const toDrop = entries.slice(MAX_SNAPSHOTS);
    for (const e of toDrop) {
      try {
        if (existsSync(e.path)) unlinkSync(e.path);
      } catch {
        // ignore — file may have been removed externally
      }
      db.run("DELETE FROM state_snapshots WHERE id = ?", [e.id]);
    }
  } catch (err) {
    console.error("[snapshot] prune failed:", (err as Error).message);
  }
}

/**
 * HTTP handler: GET /api/state/snapshots
 * Returns the snapshot index (most recent first). Operator picks an id
 * to restore.
 */
export function listSnapshotsHandler(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    ensureTable();
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const rows = db.exec(
      `SELECT id, timestamp, reason, projects, issues, columns, comments, bytes
       FROM state_snapshots ORDER BY id DESC LIMIT 50`
    );
    const snapshots = (rows[0]?.values ?? []).map((row) => ({
      id: Number(row[0]),
      timestamp: String(row[1]),
      reason: String(row[2]),
      counts: {
        projects: Number(row[3]),
        issues: Number(row[4]),
        columns: Number(row[5]),
        comments: Number(row[6]),
      },
      bytes: Number(row[7]),
    }));
    sendJson(res, 200, { snapshots, dir: SNAPSHOT_DIR });
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}

/**
 * HTTP handler: POST /api/state/restore/:id
 * Re-applies the snapshot payload via setState. Fires a fresh
 * pre-setState snapshot first so the restore itself is recoverable.
 */
export async function restoreSnapshotHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  snapshotId: number
): Promise<void> {
  try {
    ensureTable();
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }

    // Look up the snapshot row
    const idRows = db.exec("SELECT path FROM state_snapshots WHERE id = ?", [
      snapshotId,
    ]);
    const path = idRows[0]?.values[0]?.[0];
    if (!path) {
      sendJson(res, 404, { error: `Snapshot ${snapshotId} not found` });
      return;
    }
    if (!existsSync(String(path))) {
      sendJson(res, 410, {
        error: `Snapshot file missing on disk: ${path}`,
      });
      return;
    }

    // Load the payload
    const payload = JSON.parse(readFileSync(String(path), "utf8"));

    // Snapshot the CURRENT state first (so the restore is itself reversible)
    captureSnapshot(`pre-restore-${snapshotId}`);

    // Re-apply via setState — same diff/emit semantics as a normal PUT
    await setState(_req, res, payload);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}