/**
 * Activity log routes.
 * GET  /api/activity  — get activity log
 * POST /api/activity  — add activity entry
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { saveDb } from "../db/index.js";
import { sendJson, queryAll } from "./_shared.js";

export async function getAll(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const rows = queryAll("SELECT * FROM activity ORDER BY time DESC");
    sendJson(res, 200, rows);
  } catch (error) {
    console.error("getAll activity error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function create(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown
): Promise<void> {
  try {
    const { getDb } = await import("../db/index.js");
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }

    const input = body as Record<string, unknown>;
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO activity (id, issueId, action, details, time) VALUES (?, ?, ?, ?, ?)",
      [
        id,
        (input.issueId as string) ?? null,
        (input.action as string) ?? "",
        JSON.stringify(input.details ?? {}),
        now,
      ]
    );
    await saveDb();
    sendJson(res, 201, { id, ...input, time: now });
  } catch (error) {
    console.error("create activity error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, create };
