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
import { emitEvent } from "../webhooks.js";

export async function getAll(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    const projectId = url.searchParams.get("projectId");
    const search = url.searchParams.get("search");
    let sql = "SELECT * FROM issues";
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (projectId) {
      conditions.push("projectId = ?");
      params.push(projectId);
    }
    if (search) {
      conditions.push("LOWER(title) LIKE LOWER(?)");
      params.push(`%${search}%`);
    }
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
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
        (input.status as string) ?? "todo",
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

    const created = coerceNumericId({
      id: Number(id),
      title: input.title ?? "",
      description: input.description ?? "",
      status: input.status ?? "todo",
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
    });
    sendJson(res, 201, created);

    void emitEvent("ticket.created", { ...input, id: Number(id), createdAt: now, updatedAt: now });
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
  "prUrl",
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

    // Check issue exists and capture 'from' status + assignee before update.
    // We need both because reassign should fire ticket.assigned even when status
    // is unchanged (cross-agent handoff in the middle of work). Without this,
    // PUT /api/issues/<id> with {"assignee": "bert"} on a ticket already
    // assigned to elmo would silently update the DB row but emit no event —
    // bert would never know. (B1 regression test, 2026-06-17.)
    const check = db.exec(
      "SELECT id, status, assignee FROM issues WHERE id = ?",
      [String(id)]
    );
    if (check.length === 0 || check[0].values.length === 0) {
      sendJson(res, 404, { error: "Issue not found" });
      return;
    }
    const fromStatus = String(check[0].values[0][1]);
    const fromAssignee = String(check[0].values[0][2] ?? "");

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

    // Emit ticket.moved when status actually changes. B2 (2026-06-17)
    // caught the missing-assignee bug: before this, the payload was just
    // {id, from, to, actor} with no assignee field. The jirito-event-injector
    // routes by assignee — when it's missing/empty, the routing falls back
    // to default.jsonl (Evo's inbox) instead of the agent's, so the agent
    // never gets a wake. This is the same root cause family as B1's
    // silent-reassign bug: thin event payload = no agent routing.
    //
    // Fix: include the post-update full row (with assignee) in the payload,
    // matching what we did for ticket.assigned in B1. Also, only fire when
    // the status actually changed — an idempotent re-PUT with the same
    // status should not produce a duplicate dispatch.
    const toStatus = input.status as string | undefined;
    if (toStatus !== undefined && toStatus !== fromStatus) {
      void emitEvent("ticket.moved", {
        ...issue, // full post-update row: assignee, title, description, labels, etc.
        id, // numeric id, kept explicit
        from: fromStatus,
        to: toStatus,
        actor: (input.assignee as string) || "system",
      });
      // Also emit ticket.review when moving to review
      if (toStatus === "review") {
        void emitEvent("ticket.review", {
          ...issue, // also enrich review with the full row for the same reason
          id,
          from: fromStatus,
          to: toStatus,
        });
      }
    }

    // Emit ticket.assigned when the assignee actually changes. B1 (2026-06-17)
    // caught the silent-reassign bug: before this, reassigning a ticket in
    // flight updated the DB but emitted no event, so the new agent never
    // learned about the handoff. The jirito-event-injector routes this event
    // to the new agent's inbox as a handoff wake (routed_to_agent + FYI).
    //
    // The payload includes the post-update full row so the receiving agent's
    // wake text has title + description available — otherwise the new
    // assignee has to `jirito show` before they have any context to work on.
    //
    // Guard: only fire when the new value is present AND differs from the
    // current row. An idempotent re-PUT with the same assignee should not
    // produce a duplicate dispatch.
    const toAssignee = input.assignee as string | undefined;
    if (toAssignee !== undefined && toAssignee !== fromAssignee) {
      void emitEvent("ticket.assigned", {
        ...issue, // full post-update row: title, description, type, priority, labels, etc.
        id, // issue is already mapped to numericId, but pass id explicitly to be safe
        from: fromAssignee,
        to: toAssignee,
        assignee: toAssignee,
        actor: toAssignee,
      });
    }
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

    void emitEvent("ticket.deleted", { id, title: issue.title });
  } catch (error) {
    console.error("remove issue error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, getById, create, update, remove };
