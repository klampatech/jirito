/**
 * Issues CRUD routes.
 * GET    /api/issues          — list all issues
 * GET    /api/issues/:id      — get single issue
 * POST   /api/issues          — create issue
 * PUT    /api/issues/:id      — update issue
 * DELETE /api/issues/:id      — soft-delete (move to trash)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import { sendJson, queryAll, mapRow, coerceNumericId } from "./_shared.js";

export async function getAll(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    const projectId = url.searchParams.get("projectId");
    let sql = "SELECT * FROM issues";
    const params: unknown[] = [];
    if (projectId) {
      sql += " WHERE projectId = ?";
      params.push(projectId);
    }
    sql += " ORDER BY createdAt DESC";
    const issues = queryAll(sql, params).map(coerceNumericId);
    sendJson(res, 200, issues);
  } catch (error) {
    console.error("getAll issues error:", error);
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
    const result = db.exec("SELECT * FROM issues WHERE id = ?", [String(id)]);
    if (result.length === 0 || result[0].values.length === 0) {
      sendJson(res, 404, { error: "Issue not found" });
      return;
    }
    const issue = mapRow("issues", result[0].columns, result[0].values[0]);
    sendJson(res, 200, coerceNumericId(issue));
  } catch (error) {
    console.error("getById issue error:", error);
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

    // Generate ID from issueCounter metadata
    const counterResult = db.exec(
      "SELECT value FROM metadata WHERE key = 'issueCounter'"
    );
    let issueCounter =
      counterResult.length > 0
        ? parseInt(String(counterResult[0].values[0][0]), 10) || 1
        : 1;
    issueCounter += 1;
    db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('issueCounter', ?)",
      [String(issueCounter)]
    );

    const id = String(issueCounter);
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO issues (id, title, description, type, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, rank, parentIssueId, dueDate, customColumnId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        (input.title as string) ?? "",
        (input.description as string) ?? "",
        (input.type as string) ?? "task",
        (input.status as string) ?? "backlog",
        (input.priority as string) ?? "medium",
        JSON.stringify(input.labels ?? []),
        (input.assignee as string) ?? "",
        (input.reporter as string) ?? "",
        (input.projectId as string) ?? "default",
        (input.sprintId as string) ?? null,
        (input.storyPoints as number) ?? 0,
        (input.rank as number) ?? 0,
        (input.parentIssueId as string) ?? null,
        (input.dueDate as string) ?? "",
        (input.customColumnId as string) ?? null,
        now,
        now,
      ]
    );

    await saveDb();

    sendJson(res, 201, coerceNumericId({
      id: Number(id),
      title: input.title ?? "",
      description: input.description ?? "",
      status: input.status ?? "backlog",
      priority: input.priority ?? "medium",
      labels: input.labels ?? [],
      assignee: input.assignee ?? "",
      reporter: input.reporter ?? "",
      projectId: input.projectId ?? "default",
      sprintId: input.sprintId ?? null,
      storyPoints: input.storyPoints ?? 0,
      parentIssueId: input.parentIssueId ?? null,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    }));
  } catch (error) {
    console.error("create issue error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

const UPDATABLE_FIELDS = [
  "title",
  "description",
  "type",
  "status",
  "priority",
  "labels",
  "assignee",
  "reporter",
  "projectId",
  "sprintId",
  "storyPoints",
  "rank",
  "parentIssueId",
  "dueDate",
  "customColumnId",
] as const;

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

    // Check issue exists
    const check = db.exec("SELECT id FROM issues WHERE id = ?", [String(id)]);
    if (check.length === 0 || check[0].values.length === 0) {
      sendJson(res, 404, { error: "Issue not found" });
      return;
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: unknown[] = [];
    for (const field of UPDATABLE_FIELDS) {
      if (input[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === "labels") {
          params.push(JSON.stringify(input[field]));
        } else {
          params.push(input[field]);
        }
      }
    }
    updates.push("updatedAt = ?");
    params.push(now);
    params.push(String(id));

    db.run(`UPDATE issues SET ${updates.join(", ")} WHERE id = ?`, params);
    await saveDb();

    // Return updated issue
    const result = db.exec("SELECT * FROM issues WHERE id = ?", [String(id)]);
    if (result.length === 0) {
      sendJson(res, 404, { error: "Issue not found" });
      return;
    }
    const issue = mapRow("issues", result[0].columns, result[0].values[0]);
    sendJson(res, 200, coerceNumericId(issue));
  } catch (error) {
    console.error("update issue error:", error);
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

    // Get the issue before deleting
    const issueResult = db.exec("SELECT * FROM issues WHERE id = ?", [
      String(id),
    ]);
    if (issueResult.length === 0 || issueResult[0].values.length === 0) {
      sendJson(res, 404, { error: "Issue not found" });
      return;
    }
    const issue = mapRow(
      "issues",
      issueResult[0].columns,
      issueResult[0].values[0]
    );

    // Add to trash
    const trashId = `trash_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    db.run(
      "INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)",
      [trashId, "issue", JSON.stringify(issue), new Date().toISOString()]
    );

    // Delete from issues
    db.run("DELETE FROM issues WHERE id = ?", [String(id)]);

    await saveDb();

    sendJson(res, 200, { success: true, message: "Issue moved to trash" });
  } catch (error) {
    console.error("remove issue error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, getById, create, update, remove };
