/**
 * Trash routes.
 * GET    /api/trash                  — list trash items
 * POST   /api/trash/:id/restore      — restore a trash item
 * DELETE /api/trash/:id/purge        — permanently remove a trash item
 * DELETE /api/trash/:id              — remove a trash item (alias for purge)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import { sendJson, queryAll, mapRow } from "./_shared.js";
import { emitEvent } from "../webhooks.js";

export async function getAll(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const rows = queryAll("SELECT * FROM trash ORDER BY date DESC");
    sendJson(res, 200, rows);
  } catch (error) {
    console.error("getAll trash error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function restore(
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
    const result = db.exec("SELECT * FROM trash WHERE id = ?", [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      sendJson(res, 404, { error: "Trash item not found" });
      return;
    }
    const item = mapRow("trash", result[0].columns, result[0].values[0]);
    // For now restore only re-inserts the issue into the issues table.
    if (item.type === "issue" && typeof item.data === "string") {
      try {
        const data = JSON.parse(item.data);
        const now = new Date().toISOString();
        db.run(
          `INSERT OR REPLACE INTO issues
             (id, title, description, type, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, rank, parentIssueId, dueDate, customColumnId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.id,
            data.title || "",
            data.description || "",
            data.type || "task",
            data.status || "backlog",
            data.priority || "medium",
            JSON.stringify(data.labels || []),
            data.assignee || "",
            data.reporter || "",
            data.projectId || "default",
            data.sprintId || null,
            data.storyPoints || 0,
            data.rank ?? 0,
            data.parentIssueId || null,
            data.dueDate || "",
            data.customColumnId || null,
            data.createdAt || now,
            now,
          ]
        );
        db.run("DELETE FROM trash WHERE id = ?", [id]);
        await saveDb();
        // Emit so the watcher routes it (Evo triage if unassigned,
        // agent dispatch if assigned). The original ticket metadata
        // comes from the trash blob (data.id, data.title, etc.).
        void emitEvent("ticket.created", {
          id: data.id,
          title: data.title || "",
          description: data.description || "",
          type: data.type || "task",
          status: data.status || "backlog",
          priority: data.priority || "medium",
          assignee: data.assignee || "",
          reporter: data.reporter || "",
          restoredFromTrash: true,
          restoredAt: now,
        });
        sendJson(res, 200, { success: true, message: "Issue restored" });
      } catch (err) {
        sendJson(res, 500, { error: (err as Error).message });
      }
    } else {
      sendJson(res, 400, { error: `Cannot restore type: ${item.type}` });
    }
  } catch (error) {
    console.error("restore trash error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function purge(
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
    db.run("DELETE FROM trash WHERE id = ?", [id]);
    await saveDb();
    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("purge trash error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

/** Alias for purge -- both DELETE /api/trash/:id and DELETE /api/trash/:id/purge do the same thing. */
export const remove = purge;

export default { getAll, restore, purge, remove };
