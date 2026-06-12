/**
 * Comments CRUD routes.
 * GET    /api/comments              — list all comments (optionally filtered by issueId)
 * POST   /api/comments              — create comment
 * PUT    /api/comments/:id          — update comment
 * DELETE /api/comments/:id          — delete comment
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { saveDb } from "../db/index.js";
import { sendJson } from "./_shared.js";
import { getDb } from "../db/index.js";

export async function getAll(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const issueId = url.searchParams.get("issueId");
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const result = issueId
      ? db.exec("SELECT * FROM comments WHERE issueId = ? ORDER BY createdAt DESC", [issueId])
      : db.exec("SELECT * FROM comments ORDER BY createdAt DESC");
    if (result.length === 0) {
      sendJson(res, 200, []);
      return;
    }
    const cols = result[0].columns;
    const rows = result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => (obj[col] = row[i]));
      return obj;
    });
    sendJson(res, 200, rows);
  } catch (error) {
    console.error("getAll comments error:", error);
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
    const id = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO comments (id, issueId, content, author, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      [
        id,
        (input.issueId as string) ?? "",
        (input.content as string) ?? "",
        (input.author as string) ?? "",
        now,
        now,
      ]
    );
    await saveDb();
    sendJson(res, 201, {
      id,
      issueId: input.issueId ?? "",
      content: input.content ?? "",
      author: input.author ?? "",
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("create comment error:", error);
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
    db.run(
      "UPDATE comments SET content = ?, author = ?, updatedAt = ? WHERE id = ?",
      [input.content ?? "", input.author ?? "", now, id]
    );
    await saveDb();
    sendJson(res, 200, { id, ...input, updatedAt: now });
  } catch (error) {
    console.error("update comment error:", error);
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
    db.run("DELETE FROM comments WHERE id = ?", [id]);
    await saveDb();
    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("remove comment error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, create, update, remove };
