/**
 * Issues CRUD routes.
 * GET    /api/issues          — list all issues
 * GET    /api/issues/:id      — get single issue
 * POST   /api/issues          — create issue
 * PUT    /api/issues/:id      — update issue
 * DELETE /api/issues/:id      — soft-delete (move to trash)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { getDb, saveDb } from "../db/index.js";
import {
  sendJson,
  queryAll,
  mapRow,
  coerceNumericId,
  normalizeStatus,
  AGENT_CALLERS,
  getCallerFromHeader,
  readMetadata,
} from "./_shared.js";
import { emitEvent } from "../webhooks.js";
import { broadcastEvent } from "./events.js";

export async function getAll(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    const projectId = url.searchParams.get("projectId");
    const search = url.searchParams.get("search");
    let sql = "SELECT * FROM issues";
    const params: Array<string | number> = [];
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

    // JIRITO-108: default projectId to the user's currentProject (read from
    // the metadata table) instead of the hardcoded "default". The client
    // board filter `i.projectId === currentProject` (src/render.ts:174)
    // hides any ticket whose projectId doesn't match, so a "default" tag
    // orphans API-created tickets to a non-existent project (the "default"
    // project was removed at some point — see fix/jirito-101-default-*).
    // The UI's create path uses `getCurrentProject()` (src/main-issue-form.ts:83);
    // the API path now mirrors that behaviour for callers that don't
    // explicitly set projectId.
    const fallbackProjectId = readMetadata("currentProject", "default");
    db.run(
      `INSERT INTO issues (id, title, description, type, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, rank, parentIssueId, dueDate, customColumnId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        (input.title as string) ?? "",
        // 2026-06-20: see server/routes/state.ts:189 — accept either
        // field name. The form's local save path doesn't use this
        // endpoint, but the CLI / scripts / squad dispatch do, and any
        // caller that sends the client-canonical `desc` would
        // otherwise see their description silently dropped here.
        ((input.description ?? input.desc) as string) ?? "",
        (input.type as string) ?? "task",
        // 2026-06-20: normalize status so callers sending "in_progress"
        // (with underscore) end up with the canonical "inprogress" that
        // the client's default-column filter expects. See normalizeStatus
        // for the full alias table.
        normalizeStatus(input.status),
        (input.priority as string) ?? "medium",
        JSON.stringify(input.labels ?? []),
        (input.assignee as string) ?? "",
        (input.reporter as string) ?? "",
        (input.projectId as string) ?? fallbackProjectId,
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
      // 2026-06-20: see server/routes/state.ts:189 — accept either
      // field name on the way out so callers see the description they
      // sent, regardless of which field name they used.
      description: ((input.description ?? input.desc) as string) ?? "",
      status: normalizeStatus(input.status),
      priority: input.priority ?? "medium",
      labels: input.labels ?? [],
      assignee: input.assignee ?? "",
      reporter: input.reporter ?? "",
      projectId: input.projectId ?? fallbackProjectId,
      sprintId: input.sprintId ?? null,
      storyPoints: input.storyPoints ?? 0,
      parentIssueId: input.parentIssueId ?? null,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    });
    sendJson(res, 201, created);

    // 2026-06-20: use the normalized `created` object (already coerced
    // via `description ?? desc` on line 139) so the emit payload has
    // the canonical `description` field, not the caller's raw `desc`.
    // Otherwise this site would emit `desc` and diverge from the other
    // emit sites (state.ts, import-export.ts) which all emit
    // `description`.
    void emitEvent("ticket.created", { ...created, createdAt: now, updatedAt: now });
    broadcastEvent("ticket.created", { ...created, createdAt: now, updatedAt: now });
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
  // JIRITO-120: prMerged was previously dropped silently by every save
  // because it wasn't in this list. The detail-panel "PR merged" checkbox
  // toggles this flag; without persistence the icon reverts on refresh.
  "prMerged",
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

    // Close-transition gate (2026-06-21, JIRITO-101 "already handled" burn).
    // When a squad agent moves a ticket to `done` or `trash`, require a
    // `verification` field with ≥20 chars of content explaining what was
    // checked. This forces the close to come with an audit trail —
    // either a commit SHA, a PR URL, a "verified in browser: <steps>"
    // string, or a "duplicate of #N / already handled by PR #N" reason.
    //
    // Why an API-level gate (not just a skill instruction): agents skip
    // skill prose. The 2026-06-21 burn was elmo saying "Already handled
    // — continuing with the bug fix" without reproducing in the browser.
    // Path C in jirito-squad-protocol already said "post verification
    // before close"; that didn't stop the wedge. Making the gate a hard
    // pre-condition on the API call means the close literally cannot
    // happen without a recorded reason.
    //
    // Users (kyle) and the parent agent (evo) are exempt — they have
    // downstream review paths or are consciously closing. Only squad
    // agents (elmo, bert, ernie, grover) are gated.
    const CLOSE_STATUSES = new Set(["done", "trash"]);
    const requestedStatus = input.status as string | undefined;
    const normalizedRequested =
      requestedStatus !== undefined ? normalizeStatus(requestedStatus) : undefined;
    const isCloseTransition =
      normalizedRequested !== undefined &&
      normalizedRequested !== fromStatus &&
      CLOSE_STATUSES.has(normalizedRequested);
    const caller = getCallerFromHeader(_req);
    const callerLc = (caller ?? "").toLowerCase();
    const isAgentCaller = AGENT_CALLERS.has(callerLc);
    const verificationRaw = input.verification;
    const verification =
      typeof verificationRaw === "string" ? verificationRaw.trim() : "";

    if (isCloseTransition && isAgentCaller) {
      if (verification.length < 20) {
        sendJson(res, 400, {
          error:
            "Verification required when an agent closes a ticket to '" +
            normalizedRequested +
            "'",
          hint:
            "Pass a `verification` field (≥20 chars) — e.g. a commit SHA, " +
            "a PR URL, `verified in browser: <steps>`, or " +
            "`duplicate of #N / already handled by PR #N`. The reason " +
            "is auto-posted as a comment on the ticket for the audit trail.",
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: unknown[] = [];
    for (const field of UPDATABLE_FIELDS) {
      if (input[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === "labels") {
          params.push(JSON.stringify(input[field]));
        } else if (field === "status") {
          // 2026-06-20: normalize aliases like "in_progress" → "inprogress"
          // before the UPDATE runs. See normalizeStatus comment above.
          params.push(normalizeStatus(input[field]));
        } else if (field === "prMerged") {
          // JIRITO-120: SQLite has no native boolean. The client sends
          // a real `boolean`; coerce to 0/1 for storage. Anything
          // truthy (true, 1, "true", "1") → 1; anything else → 0.
          params.push(input[field] ? 1 : 0);
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

    // Auto-write the verification text as a comment when an agent
    // closes a ticket. This is the audit trail half of the close gate —
    // the rejection above forces the agent to provide text, this part
    // makes sure the text actually lands in the ticket timeline where
    // kyle can see it. Idempotent: if a comment with the same content
    // already exists for this issue (e.g. the agent manually posted it
    // first), skip the auto-write to avoid duplicates.
    if (isCloseTransition && isAgentCaller && verification.length >= 20) {
      try {
        const existing = db.exec(
          "SELECT id FROM comments WHERE issueId = ? AND content = ?",
          [String(id), `[auto-verification] ${verification}`]
        );
        const alreadyPosted =
          existing.length > 0 && existing[0].values.length > 0;
        if (!alreadyPosted) {
          const autoId = `auto-${randomUUID()}`;
          db.run(
            "INSERT INTO comments (id, issueId, author, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
            [
              autoId,
              String(id),
              callerLc || "system",
              `[auto-verification] ${verification}`,
              now,
              now,
            ]
          );
          await saveDb();
        }
      } catch (err) {
        // Non-fatal — the close itself still succeeded. Log and move on.
        console.warn("auto-verification comment write failed:", err);
      }
    }

    // Return updated issue
    const result = db.exec("SELECT * FROM issues WHERE id = ?", [String(id)]);
    if (result.length === 0) {
      sendJson(res, 404, { error: "Issue not found" });
      return;
    }
    const issue = mapRow("issues", result[0].columns, result[0].values[0]);
    sendJson(res, 200, coerceNumericId(issue));

    // Emit ticket.updated on every successful PUT. The other event types
    // (moved, assigned, review) only fire on their respective field
    // changes — meaning a PUT that touches only `prMerged` (or any other
    // non-status/non-assignee field) would silently fail to notify
    // connected SSE clients, leaving them with stale in-memory state.
    // ticket.updated is the catch-all that keeps the board in sync with
    // any other-field mutation. The other emits remain gated so we don't
    // double-fire (moved/assigned/review) when those fields change.
    broadcastEvent("ticket.updated", { ...issue, id });

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
      broadcastEvent("ticket.moved", {
        ...issue,
        id,
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
        broadcastEvent("ticket.review", {
          ...issue,
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
      broadcastEvent("ticket.assigned", {
        ...issue,
        id,
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
    broadcastEvent("ticket.deleted", { id, title: issue.title });
  } catch (error) {
    console.error("remove issue error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, getById, create, update, remove };
