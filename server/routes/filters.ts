/**
 * Saved Filters CRUD routes.
 * GET    /api/filters           — list all filters
 * POST   /api/filters           — create filter
 * PUT    /api/filters/:id       — update filter
 * DELETE /api/filters/:id       — delete filter
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import { sendJson, queryAll, mapRow } from "./_shared.js";

export async function getAll(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const rows = queryAll(
      "SELECT * FROM filters ORDER BY sortOrder ASC, createdAt ASC"
    );
    sendJson(res, 200, rows);
  } catch (error) {
    console.error("getAll filters error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function create(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const input = body as Record<string, unknown>;
    const id = `flt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO filters (id, name, query, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      [
        id,
        (input.name as string) ?? "",
        JSON.stringify(input.query ?? {}),
        (input.sortOrder as number) ?? 0,
        now,
        now,
      ]
    );
    await saveDb();
    sendJson(res, 201, { id, ...input, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error("create filter error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function update(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string,
  body: unknown
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const input = body as Record<string, unknown>;
    const now = new Date().toISOString();
    const fields = ["name", "query", "sortOrder"];
    const updates: string[] = [];
    const params: unknown[] = [];
    for (const field of fields) {
      if (input[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === "query") {
          params.push(JSON.stringify(input[field]));
        } else {
          params.push(input[field]);
        }
      }
    }
    updates.push("updatedAt = ?");
    params.push(now);
    params.push(id);
    db.run(`UPDATE filters SET ${updates.join(", ")} WHERE id = ?`, params);
    await saveDb();

    const result = db.exec("SELECT * FROM filters WHERE id = ?", [id]);
    if (result.length === 0) {
      sendJson(res, 404, { error: "Filter not found" });
      return;
    }
    const filter = mapRow("filters", result[0].columns, result[0].values[0]);
    sendJson(res, 200, filter);
  } catch (error) {
    console.error("update filter error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function remove(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    db.run("DELETE FROM filters WHERE id = ?", [id]);
    await saveDb();
    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("remove filter error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, create, update, remove };
