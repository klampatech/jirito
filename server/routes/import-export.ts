/**
 * Import/Export routes.
 * POST /api/import  — import exported JSON data
 * GET  /api/export  — export all data as JSON
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import { sendJson, queryAll, mapRow, parseJsonColumn } from "./_shared.js";
import { emitEvent } from "../webhooks.js";

/** Structural validation of an incoming import payload. */
function validateImportPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Invalid format: body must be an object";
  }
  const data = body as Record<string, unknown>;
  if (!data.issues || !Array.isArray(data.issues)) {
    return "Invalid format: missing issues array";
  }
  if (
    typeof data.projects !== "object" ||
    data.projects === null ||
    Array.isArray(data.projects)
  ) {
    return "Invalid format: projects must be an object";
  }

  const projects = data.projects as Record<string, unknown>;
  for (const [key, proj] of Object.entries(projects)) {
    if (typeof proj !== "object" || proj === null) {
      return `Invalid project "${key}"`;
    }
    const p = proj as Record<string, unknown>;
    if (typeof p.name !== "string" || p.name.trim() === "") {
      return `Project "${key}" must have a non-empty name`;
    }
    if (typeof p.key !== "string" || p.key.trim() === "") {
      return `Project "${key}" must have a non-empty key`;
    }
  }

  for (const issueRaw of data.issues as Array<unknown>) {
    const issue = issueRaw as Record<string, unknown>;
    if (issue.id == null || issue.title == null || issue.status == null) {
      return `Issue ${issue.id}: must have id, title, and status fields`;
    }
    const validStatuses = [
      "todo",
      "inprogress",
      "review",
      "done",
    ];
    if (!validStatuses.includes(String(issue.status))) {
      return `Issue ${issue.id}: invalid status "${String(issue.status)}"`;
    }
  }
  return null;
}

export async function importData(
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

    const validationError = validateImportPayload(body);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }
    const data = body as Record<string, unknown>;
    const projectsIn = data.projects as Record<string, Record<string, unknown>>;
    const issuesIn = data.issues as Array<Record<string, unknown>>;
    const commentsIn = (data.comments ?? {}) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const sprintsIn = (data.sprints ?? []) as Array<Record<string, unknown>>;
    const filtersIn = (data.savedFilters ?? []) as Array<
      Record<string, unknown>
    >;
    const activityIn = (data.activityLog ?? []) as Array<Record<string, unknown>>;
    const trashIn = (data.trash ?? []) as Array<Record<string, unknown>>;

    // Disable FK checks for the entire import (we validate data above)
    db.run("PRAGMA foreign_keys=OFF");

    // Clear existing data
    db.run("DELETE FROM issues");
    db.run("DELETE FROM comments");
    db.run("DELETE FROM sprints");
    db.run("DELETE FROM filters");
    db.run("DELETE FROM activity");
    db.run("DELETE FROM trash");
    db.run("DELETE FROM columns");
    db.run("DELETE FROM metadata");
    db.run("DELETE FROM projects");

    // Wrap all inserts in a transaction for atomicity
    db.run("BEGIN TRANSACTION");

    const now = new Date().toISOString();

    // Insert projects
    for (const [key, proj] of Object.entries(projectsIn)) {
      db.run(
        "INSERT INTO projects (id, name, key, icon, color, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          key,
          (proj.name as string) ?? "",
          (proj.key as string) ?? key,
          (proj.icon as string) ?? "🚀",
          (proj.color as string) ?? "#0052CC",
          (proj.description as string) ?? "",
          (proj.createdAt as string) ?? now,
          now,
        ]
      );
    }

    // Insert issues
    for (const issue of issuesIn) {
      const labels =
        typeof issue.labels === "string"
          ? issue.labels
          : JSON.stringify(issue.labels ?? []);
      const createdAt = (issue.createdAt as string) ?? now;
      const updatedAt = (issue.updatedAt as string) ?? now;
      const issueId = String(issue.id);
      db.run(
        "INSERT INTO issues (id, title, description, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, parentIssueId, customColumnId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          issueId,
          (issue.title as string) ?? "",
          (issue.description as string) ?? "",
          (issue.status as string) ?? "todo",
          (issue.priority as string) ?? "medium",
          labels,
          (issue.assignee as string) ?? "",
          (issue.reporter as string) ?? "",
          (issue.projectId as string) ?? "default",
          (issue.sprintId as string) ?? null,
          (issue.storyPoints as number) ?? 0,
          (issue.parentIssueId as string) ?? null,
          (issue.customColumnId as string) ?? null,
          createdAt,
          updatedAt,
        ]
      );
      // Emit per-issue so the watcher routes each one. Import is a
      // deliberate bulk operation; the user expects each ticket to
      // dispatch to the right inbox.
      void emitEvent("ticket.created", {
        id: Number(issueId) || issueId,
        title: issue.title ?? "",
        description: issue.description ?? "",
        type: issue.type ?? "task",
        status: issue.status ?? "todo",
        priority: issue.priority ?? "medium",
        assignee: issue.assignee ?? "",
        reporter: issue.reporter ?? "",
        createdAt,
        updatedAt,
        fromImport: true,
      });
    }

    // Insert comments
    for (const [issueId, comments] of Object.entries(commentsIn)) {
      if (Array.isArray(comments)) {
        for (const comment of comments) {
          const commentCreated = (comment.createdAt as string) ?? now;
          const commentUpdated = (comment.updatedAt as string) ?? now;
          db.run(
            "INSERT INTO comments (id, issueId, content, author, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
            [
              (comment.id as string) ?? `cmt_${Date.now()}`,
              issueId,
              (comment.content as string) ?? "",
              (comment.author as string) ?? "",
              commentCreated,
              commentUpdated,
            ]
          );
        }
      }
    }

    // Insert sprints
    for (const sprint of sprintsIn) {
      const sprintCreated = (sprint.createdAt as string) ?? now;
      const sprintUpdated = (sprint.updatedAt as string) ?? now;
      db.run(
        "INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          (sprint.id as string) ?? `spr_${Date.now()}`,
          (sprint.projectId as string) ?? "default",
          (sprint.name as string) ?? "",
          (sprint.status as string) ?? "active",
          (sprint.startDate as string) ?? null,
          (sprint.endDate as string) ?? null,
          (sprint.goal as string) ?? "",
          sprintCreated,
          sprintUpdated,
        ]
      );
    }

    // Insert filters
    for (const filter of filtersIn) {
      const filterQuery =
        typeof filter.query === "string"
          ? filter.query
          : JSON.stringify(filter.query ?? {});
      const filterCreated = (filter.createdAt as string) ?? now;
      const filterUpdated = (filter.updatedAt as string) ?? now;
      db.run(
        "INSERT INTO filters (id, name, query, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          (filter.id as string) ?? `flt_${Date.now()}`,
          (filter.name as string) ?? "",
          filterQuery,
          (filter.sortOrder as number) ?? 0,
          filterCreated,
          filterUpdated,
        ]
      );
    }

    // Insert activity log
    for (const entry of activityIn) {
      const activityDetails =
        typeof entry.details === "string"
          ? entry.details
          : JSON.stringify(entry.details ?? {});
      const activityTime = (entry.time as string) ?? now;
      db.run(
        "INSERT INTO activity (id, issueId, action, details, time) VALUES (?, ?, ?, ?, ?)",
        [
          (entry.id as string) ?? `act_${Date.now()}`,
          (entry.issueId as string) ?? null,
          (entry.action as string) ?? "",
          activityDetails,
          activityTime,
        ]
      );
    }

    // Insert trash
    for (const item of trashIn) {
      const trashData =
        typeof item.data === "string"
          ? item.data
          : JSON.stringify(item.data ?? {});
      const trashDate = (item.date as string) ?? now;
      db.run(
        "INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)",
        [
          (item.id as string) ?? `trash_${Date.now()}`,
          (item.type as string) ?? "issue",
          trashData,
          trashDate,
        ]
      );
    }

    // Set metadata
    const issueCounter = (data.issueCounter as number) ?? 1;
    db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('issueCounter', ?)",
      [String(issueCounter)]
    );
    db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)",
      [String(data.currentProject ?? "default")]
    );

    // Commit transaction
    db.run("COMMIT");

    await saveDb();

    let commentCount = 0;
    for (const arr of Object.values(commentsIn)) {
      commentCount += Array.isArray(arr) ? arr.length : 0;
    }

    sendJson(res, 200, {
      success: true,
      message: "Import successful",
      imported: {
        issues: issuesIn.length,
        projects: Object.keys(projectsIn).length,
        comments: commentCount,
        sprints: sprintsIn.length,
        filters: filtersIn.length,
        activity: activityIn.length,
        trash: trashIn.length,
      },
    });
  } catch (error) {
    console.error("import error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

/** Export all data in the format matching the frontend's exportData(). */
export function exportData(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }

    // Issues
    const issuesResult = db.exec(
      "SELECT * FROM issues ORDER BY id ASC"
    );
    const issues = issuesResult.length > 0
      ? issuesResult[0].values.map((row) =>
          mapRow("issues", issuesResult[0].columns, row)
        )
      : [];

    // Projects
    const projects: Record<string, unknown> = {};
    const projectsResult = db.exec("SELECT * FROM projects");
    if (projectsResult.length > 0) {
      for (const row of projectsResult[0].values) {
        const obj = mapRow(
          "projects",
          projectsResult[0].columns,
          row
        );
        const key = String(obj.id);
        delete obj.id;
        projects[key] = obj;
      }
    }

    // Current project
    const currentResult = db.exec(
      "SELECT value FROM metadata WHERE key = 'currentProject'"
    );
    const currentProject =
      currentResult.length > 0
        ? String(currentResult[0].values[0][0])
        : "default";

    // Issue counter
    const counterResult = db.exec(
      "SELECT value FROM metadata WHERE key = 'issueCounter'"
    );
    const issueCounter =
      counterResult.length > 0
        ? parseInt(String(counterResult[0].values[0][0]), 10) || 1
        : 1;

    // Comments grouped by issueId
    const comments: Record<string, unknown[]> = {};
    const commentsResult = db.exec("SELECT * FROM comments");
    if (commentsResult.length > 0) {
      for (const row of commentsResult[0].values) {
        const obj = mapRow(
          "comments",
          commentsResult[0].columns,
          row
        );
        const issueId = String(obj.issueId);
        delete obj.issueId;
        (comments[issueId] ??= []).push(obj);
      }
    }

    // Sprints
    const sprints = queryAll(
      "SELECT * FROM sprints ORDER BY createdAt ASC"
    );

    // Filters
    const filtersResult = db.exec(
      "SELECT * FROM filters ORDER BY sortOrder ASC"
    );
    const savedFilters = filtersResult.length > 0
      ? filtersResult[0].values.map((row) => {
          const obj = mapRow(
            "filters",
            filtersResult[0].columns,
            row
          );
          // parseJsonColumn already called by mapRow for `query`
          return obj;
        })
      : [];

    // Activity log
    const activityLog = queryAll(
      "SELECT * FROM activity ORDER BY time DESC"
    );

    // Trash
    const trashResult = db.exec("SELECT * FROM trash ORDER BY date DESC");
    const trash = trashResult.length > 0
      ? trashResult[0].values.map((row) =>
          mapRow("trash", trashResult[0].columns, row)
        )
      : [];

    const exportShape = {
      issues,
      comments,
      projects,
      currentProject,
      savedFilters,
      activityLog,
      issueCounter,
      trash,
      sprints,
    };

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": `attachment; filename="jirito-export-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(JSON.stringify(exportShape, null, 2));
  } catch (error) {
    console.error("export error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { importData, exportData };
