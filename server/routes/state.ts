/**
 * State sync endpoint.
 * GET  /api/state  — returns full application state
 * PUT  /api/state  — replaces all state (import/sync)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import {
  sendJson,
  queryAll,
  mapRow,
  coerceNumericId,
  normalizeStatus,
  readMetadata,
} from "./_shared.js";
import { emitEvent, isSilentRequest } from "../webhooks.js";
import { broadcastEvent } from "./events.js";

export async function getState(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }

    // Projects
    const projects = queryAll(
      "SELECT * FROM projects ORDER BY createdAt ASC"
    );
    const currentProject = readMetadata("currentProject", "default");

    // Issues
    const issues = queryAll(
      "SELECT * FROM issues ORDER BY createdAt ASC"
    ).map(coerceNumericId);

    // Sprints (object keyed by id, matching the frontend's expected shape)
    const sprintsArr = queryAll(
      "SELECT * FROM sprints ORDER BY createdAt ASC"
    );
    const sprints: Record<string, unknown> = {};
    for (const s of sprintsArr) {
      sprints[String((s as { id: unknown }).id)] = s;
    }

    // Activity log
    const activity = queryAll(
      "SELECT * FROM activity ORDER BY time DESC LIMIT 100"
    );

    // Saved filters
    const savedFilters = queryAll(
      "SELECT * FROM filters ORDER BY sortOrder ASC"
    );

    // Trash
    const trash = queryAll("SELECT * FROM trash ORDER BY date DESC");

    // Issue counter
    const counterResult = db.exec(
      "SELECT value FROM metadata WHERE key = 'issueCounter'"
    );
    const issueCounter =
      counterResult.length > 0
        ? parseInt(String(counterResult[0].values[0][0]), 10) || 1
        : 1;

    // Build the projects object that the frontend expects
    const projectsObj: Record<string, unknown> = {};
    for (const proj of projects) {
      const id = String((proj as { id: unknown }).id);
      projectsObj[id] = {
        name: (proj as { name?: string }).name,
        key: (proj as { key?: string }).key ?? id,
        icon: (proj as { icon?: string }).icon ?? "🚀",
        color: (proj as { color?: string }).color ?? "#0052CC",
        description: (proj as { description?: string }).description ?? "",
        issues: issues
          .filter((i) => (i as { projectId?: string }).projectId === id)
          .map((i) => (i as { id: unknown }).id),
      };
    }

    // Comments
    const comments = queryAll(
      "SELECT * FROM comments ORDER BY createdAt ASC"
    );

    // Custom columns
    const columns = queryAll("SELECT * FROM columns ORDER BY sortOrder ASC");

    // Default column overrides (name/color for the 4 built-in columns)
    const defaultColumnOverridesStr = readMetadata("defaultColumnOverrides", "{}");
    let defaultColumnOverrides: Record<string, { name?: string; color?: string }> = {};
    try {
      defaultColumnOverrides = JSON.parse(defaultColumnOverridesStr);
    } catch {
      defaultColumnOverrides = {};
    }

    sendJson(res, 200, {
      issues,
      comments,
      projects: projectsObj,
      currentProject,
      savedFilters,
      activityLog: activity,
      issueCounter,
      trash,
      sprints,
      columns,
      _defaultColumnOverrides: defaultColumnOverrides,
    });
  } catch (error) {
    console.error("getState error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function setState(
  _req: IncomingMessage,
  res: ServerResponse,
  rawData: unknown
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const data = rawData as Record<string, unknown>;

    // Capture existing issues BEFORE the DELETE so we can diff and emit
    // per-ticket events. Without this, every state sync (which the UI does
    // on every form submit via saveStateImmediate) would either emit 0
    // events (the bug Kyle hit with #101) or emit N events for a 1-ticket
    // change. Diffing is the correct semantics.
    const existingIssues = new Map<string, Record<string, unknown>>();
    if (data.issues !== undefined) {
      for (const issue of queryAll("SELECT * FROM issues")) {
        const mapped = issue as Record<string, unknown>;
        existingIssues.set(String(mapped.id), mapped);
      }
    }

    // Clear existing data (only for fields that are being updated)
    if (data.activityLog !== undefined) db.run("DELETE FROM activity");
    if (data.columns !== undefined) db.run("DELETE FROM columns");
    if (data.comments !== undefined) db.run("DELETE FROM comments");
    if (data.savedFilters !== undefined) db.run("DELETE FROM filters");
    if (data.issues !== undefined) db.run("DELETE FROM issues");
    if (data.projects !== undefined) db.run("DELETE FROM projects");
    if (data.sprints !== undefined) db.run("DELETE FROM sprints");
    if (data.trash !== undefined) db.run("DELETE FROM trash");

    // Import projects
    const dataProjects = data.projects as Record<string, Record<string, unknown>> | undefined;
    if (dataProjects) {
      const projectIds = Object.keys(dataProjects);
      for (const projId of projectIds) {
        const proj = dataProjects[projId];
        db.run(
          "INSERT INTO projects (id, name, key, icon, color, description) VALUES (?, ?, ?, ?, ?, ?)",
          [
            projId,
            (proj.name as string) ?? "",
            (proj.key as string) ?? projId,
            (proj.icon as string) ?? "🚀",
            (proj.color as string) ?? "#0052CC",
            (proj.description as string) ?? "",
          ]
        );
      }
    }

    // Import issues
    // NOTE: Column list must stay in sync with server/db/init.js schema. The
    // previous version of this INSERT was missing `dueDate`, which caused
    // full-state syncs to silently drop the field (defaulting to ''). That
    // broke overdue-notification tests and any feature that depends on
    // dueDate being persisted end-to-end.
    if (data.issues) {
      for (const issue of data.issues as Array<Record<string, unknown>>) {
        db.run(
          `INSERT INTO issues (id, title, description, type, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, rank, parentIssueId, dueDate, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(issue.id),
            (issue.title as string) ?? "",
            // 2026-06-20: client uses `desc` (the canonical Issue field per
            // src/types.ts: "Legacy alias for description. Older issues
            // use `desc`.") but the DB column is `description`. Accept
            // either so full-state saves from the UI don't silently drop
            // the field. Same pattern as the read path in state.ts:218.
            ((issue.description ?? issue.desc) as string) ?? "",
            (issue.type as string) ?? "task",
            // 2026-06-20: normalize aliases like "in_progress" → "inprogress"
            // for the bulk state import path. See normalizeStatus in _shared.
            normalizeStatus(issue.status),
            (issue.priority as string) ?? "medium",
            JSON.stringify(issue.labels ?? []),
            (issue.assignee as string) ?? "",
            (issue.reporter as string) ?? "",
            (issue.projectId as string) ?? "default",
            (issue.sprintId as string) ?? null,
            (issue.storyPoints as number) ?? 0,
            (issue.rank as number) ?? 0,
            (issue.parentIssueId as string) ?? null,
            (issue.dueDate as string) ?? "",
            (issue.createdAt as string) ?? new Date().toISOString(),
            (issue.updatedAt as string) ?? new Date().toISOString(),
          ]
        );
      }
    }

    // Import sprints
    if (data.sprints && typeof data.sprints === "object") {
      for (const [sprintId, sprint] of Object.entries(
        data.sprints as Record<string, unknown>
      )) {
        const s = sprint as Record<string, unknown>;
        db.run(
          "INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal, active, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            sprintId,
            (s.projectId as string) ?? "default",
            (s.name as string) ?? "",
            (s.status as string) ?? "active",
            (s.startDate as string) ?? null,
            (s.endDate as string) ?? null,
            (s.goal as string) ?? "",
            s.active ? 1 : 0,
            s.archived ? 1 : 0,
          ]
        );
      }
    }

    // Import activity log
    if (data.activityLog) {
      for (const activity of data.activityLog as Array<Record<string, unknown>>) {
        db.run(
          "INSERT INTO activity (id, issueId, action, details, time) VALUES (?, ?, ?, ?, ?)",
          [
            `activity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            (activity.issueId as string) ?? null,
            (activity.action as string) ?? "",
            typeof activity.details === "string"
              ? activity.details
              : JSON.stringify(activity.details ?? {}),
            (activity.time as string) ?? new Date().toISOString(),
          ]
        );
      }
    }

    // Import saved filters
    if (data.savedFilters) {
      for (const filter of data.savedFilters as Array<Record<string, unknown>>) {
        db.run(
          "INSERT INTO filters (id, name, query, sortOrder) VALUES (?, ?, ?, ?)",
          [
            (filter.id as string) ?? `flt_${Date.now()}`,
            (filter.name as string) ?? "",
            typeof filter.query === "string"
              ? filter.query
              : JSON.stringify(filter.query ?? {}),
            (filter.sortOrder as number) ?? 0,
          ]
        );
      }
    }

    // Import trash
    if (data.trash) {
      for (const t of data.trash as Array<Record<string, unknown>>) {
        db.run(
          "INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)",
          [
            (t.id as string) ??
              `trash_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            (t.type as string) ?? "issue",
            JSON.stringify(t.data ?? {}),
            (t.date as string) ?? new Date().toISOString(),
          ]
        );
      }
    }

    // Import comments
    if (data.comments) {
      for (const c of data.comments as Array<Record<string, unknown>>) {
        db.run(
          "INSERT INTO comments (id, issueId, content, author, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
          [
            (c.id as string) ?? `cmt_${Date.now()}`,
            (c.issueId as string) ?? "",
            (c.content as string) ?? "",
            (c.author as string) ?? "",
            (c.createdAt as string) ?? new Date().toISOString(),
            (c.updatedAt as string) ?? new Date().toISOString(),
          ]
        );
      }
    }

    // Import custom columns
    if (data.columns) {
      for (const col of data.columns as Array<Record<string, unknown>>) {
        db.run(
          "INSERT INTO columns (id, name, query, projectId, sortOrder) VALUES (?, ?, ?, ?, ?)",
          [
            (col.id as string) ?? `col_${Date.now()}`,
            (col.name as string) ?? "",
            typeof col.query === "string"
              ? col.query
              : JSON.stringify(col.query ?? {}),
            (col.projectId as string) ?? null,
            (col.sortOrder as number) ?? 0,
          ]
        );
      }
    }

    // Set current project
    if (data.currentProject) {
      db.run(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)",
        [String(data.currentProject)]
      );
    }

    // Set issue counter
    if (data.issueCounter) {
      db.run(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('issueCounter', ?)",
        [String(data.issueCounter)]
      );
    }

    // Persist default column overrides (name/color for the 4 built-in columns)
    if (data._defaultColumnOverrides) {
      db.run(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('defaultColumnOverrides', ?)",
        [JSON.stringify(data._defaultColumnOverrides)]
      );
    }

    await saveDb();

    // Emit per-ticket events based on the diff. Fire-and-forget (void);
    // emitEvent handles its own outbox + bridge POST. The state-sync path
    // is the UI's primary create path (saveStateImmediate from
    // main-issue-form.ts), so this is what makes "create a ticket in the
    // UI" produce a wake. Without this, the UI form's create was silent
    // (the bug that lost #101).
    //
    // Three diff cases per issue in the new state:
    //   - new (not in old)         → ticket.created
    //   - changed (in both, fields differ) → ticket.updated
    //   - unchanged                → skip
    // Plus: issues in old but not in new → ticket.deleted
    //
    // We compare on "meaningful" fields only — not updatedAt (always
    // changes on every sync) or rank (UI-only display sort). This way
    // a pure status move, reassign, title edit, etc. all fire events.
    //
    // Skip the entire diff loop when the request carries X-Jirito-Silent.
    // emitEvent/broadcastEvent already check isSilentRequest(), but
    // batching the per-issue events here would still do 6 lookups +
    // 6 emit calls per resetAndSeed; a single early-return is cleaner
    // and avoids the work entirely.
    if (isSilentRequest()) {
      sendJson(res, 200, { success: true });
      return;
    }
    if (data.issues !== undefined) {
      const newIssues = (data.issues as Array<Record<string, unknown>>);
      const newIds = new Set(newIssues.map((i) => String(i.id)));
      const meaningful: Array<keyof Record<string, unknown>> = [
        "title", "description", "type", "status", "priority",
        "assignee", "reporter", "customColumnId", "parentIssueId",
      ];

      for (const issue of newIssues) {
        const id = String(issue.id);
        const old = existingIssues.get(id);
        if (!old) {
          void emitEvent("ticket.created", {
            id: Number(id) || id,
            title: issue.title ?? "",
            description: ((issue.description ?? issue.desc) as string) ?? "",
            type: issue.type ?? "task",
            status: normalizeStatus(issue.status),
            priority: issue.priority ?? "medium",
            labels: issue.labels ?? [],
            assignee: issue.assignee ?? "",
            reporter: issue.reporter ?? "",
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
          });
          broadcastEvent("ticket.created", {
            id: Number(id) || id,
            title: issue.title ?? "",
            description: ((issue.description ?? issue.desc) as string) ?? "",
            type: issue.type ?? "task",
            status: normalizeStatus(issue.status),
            priority: issue.priority ?? "medium",
            labels: issue.labels ?? [],
            assignee: issue.assignee ?? "",
            reporter: issue.reporter ?? "",
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
          });
        } else {
          // Check for meaningful changes
          const changed = meaningful.some((k) => old[k] !== issue[k]);
          if (changed) {
            void emitEvent("ticket.updated", {
              id: Number(id) || id,
              title: issue.title ?? "",
              description: ((issue.description ?? issue.desc) as string) ?? "",
              type: issue.type ?? "task",
              status: normalizeStatus(issue.status),
              priority: issue.priority ?? "medium",
              assignee: issue.assignee ?? "",
              reporter: issue.reporter ?? "",
              createdAt: issue.createdAt,
              updatedAt: issue.updatedAt,
              previousStatus: old.status,
              previousAssignee: old.assignee,
            });
            broadcastEvent("ticket.updated", {
              id: Number(id) || id,
              title: issue.title ?? "",
              description: ((issue.description ?? issue.desc) as string) ?? "",
              type: issue.type ?? "task",
              status: normalizeStatus(issue.status),
              priority: issue.priority ?? "medium",
              assignee: issue.assignee ?? "",
              reporter: issue.reporter ?? "",
              createdAt: issue.createdAt,
              updatedAt: issue.updatedAt,
              previousStatus: old.status,
              previousAssignee: old.assignee,
            });
          }
        }
      }

      for (const [id, old] of existingIssues) {
        if (!newIds.has(id)) {
          void emitEvent("ticket.deleted", {
            id: Number(id) || id,
            title: old.title,
          });
          broadcastEvent("ticket.deleted", {
            id: Number(id) || id,
            title: old.title,
          });
        }
      }
    }

    sendJson(res, 200, { success: true, message: "State imported successfully" });
  } catch (error) {
    console.error("setState error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getState, setState };
