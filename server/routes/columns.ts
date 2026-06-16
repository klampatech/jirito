/**
 * Columns CRUD routes.
 * GET    /api/columns           — list all columns (supports ?name= filter)
 * GET    /api/columns/:id       — get single column
 * POST   /api/columns           — create column
 * PUT    /api/columns/:id       — update column
 * DELETE /api/columns/:id       — delete column
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import { sendJson, queryAll, mapRow } from "./_shared.js";

export async function getAll(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    const nameFilter = url.searchParams.get("name");
    if (nameFilter) {
      // Exact-match filter for CLI lookup
      const columns = queryAll(
        "SELECT * FROM columns WHERE name = ? ORDER BY sortOrder ASC",
        [nameFilter]
      );
      sendJson(res, 200, columns);
    } else {
      const columns = queryAll(
        "SELECT * FROM columns ORDER BY sortOrder ASC"
      );
      sendJson(res, 200, columns);
    }
  } catch (error) {
    console.error("getAll columns error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function getById(
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
    const result = db.exec("SELECT * FROM columns WHERE id = ?", [String(id)]);
    if (result.length === 0 || result[0].values.length === 0) {
      sendJson(res, 404, { error: "Column not found" });
      return;
    }
    const column = mapRow("columns", result[0].columns, result[0].values[0]);
    sendJson(res, 200, column);
  } catch (error) {
    console.error("getById column error:", error);
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
    const name = input.name as string;
    if (!name) {
      sendJson(res, 400, { error: "name is required" });
      return;
    }

    const now = new Date().toISOString();
    const id = `col_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const query = input.query !== undefined ? input.query : {};
    const projectId = input.projectId !== undefined ? input.projectId : null;
    const sortOrder =
      input.sortOrder !== undefined
        ? (input.sortOrder as number)
        : 0;

    db.run(
      `INSERT INTO columns (id, name, query, projectId, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, JSON.stringify(query), projectId, sortOrder, now, now]
    );

    await saveDb();

    sendJson(res, 201, {
      id,
      name,
      query,
      projectId,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("create column error:", error);
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

    // Check column exists
    const check = db.exec("SELECT id FROM columns WHERE id = ?", [String(id)]);
    if (check.length === 0 || check[0].values.length === 0) {
      sendJson(res, 404, { error: "Column not found" });
      return;
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      params.push(input.name as string);
    }
    if (input.query !== undefined) {
      updates.push("query = ?");
      params.push(JSON.stringify(input.query));
    }
    if (input.projectId !== undefined) {
      updates.push("projectId = ?");
      params.push(input.projectId as string | null);
    }
    if (input.sortOrder !== undefined) {
      updates.push("sortOrder = ?");
      params.push(input.sortOrder as number);
    }

    if (updates.length === 0) {
      sendJson(res, 400, { error: "No fields to update" });
      return;
    }

    updates.push("updatedAt = ?");
    params.push(now);
    params.push(String(id));

    db.run(
      `UPDATE columns SET ${updates.join(", ")} WHERE id = ?`,
      params
    );
    await saveDb();

    // Return updated column
    const result = db.exec("SELECT * FROM columns WHERE id = ?", [String(id)]);
    if (result.length === 0 || result[0].values.length === 0) {
      sendJson(res, 404, { error: "Column not found" });
      return;
    }
    const column = mapRow("columns", result[0].columns, result[0].values[0]);
    sendJson(res, 200, column);
  } catch (error) {
    console.error("update column error:", error);
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

    // Check column exists
    const check = db.exec("SELECT id FROM columns WHERE id = ?", [String(id)]);
    if (check.length === 0 || check[0].values.length === 0) {
      sendJson(res, 404, { error: "Column not found" });
      return;
    }

    // Reject if any issue references this column
    const countResult = db.exec(
      "SELECT COUNT(*) as count FROM issues WHERE customColumnId = ?",
      [String(id)]
    );
    const count =
      countResult.length > 0 ? Number(countResult[0].values[0][0]) : 0;
    if (count > 0) {
      sendJson(res, 409, {
        error: `Cannot delete column: ${count} issue(s) still reference it`,
      });
      return;
    }

    db.run("DELETE FROM columns WHERE id = ?", [String(id)]);
    await saveDb();

    sendJson(res, 200, { success: true, message: "Column deleted" });
  } catch (error) {
    console.error("remove column error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, getById, create, update, remove };
