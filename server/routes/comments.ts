/**
 * Comments CRUD routes.
 * GET    /api/comments              — list all comments (optionally filtered by issueId)
 * POST   /api/comments              — create comment
 * PUT    /api/comments/:id          — update comment
 * DELETE /api/comments/:id          — delete comment
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { saveDb } from "../db/index.js";
import {
  sendJson,
  mapRow,
  coerceNumericId,
  validateCommentAuthor,
  validateVerdictCaller,
  getCallerFromHeader,
  getProjectKey,
} from "./_shared.js";
import { getDb } from "../db/index.js";
import { emitEvent } from "../webhooks.js";

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
  req: IncomingMessage,
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

    // Layer 1 (body gate) — added 2026-06-20 after the JIRITO-101
    // impersonation burn: elmo posted a "Review verdict: PASS" comment
    // with `author="evo"`, which the server previously accepted.
    const authorCheck = validateCommentAuthor(input.author, input.content);
    if (!authorCheck.ok) {
      sendJson(res, 400, { error: authorCheck.error });
      return;
    }

    // Layer 2 (caller gate) — closes the impersonation gap. The body
    // gate is spoofable (anyone can set author="evo"); the caller
    // header is set by the CLI/agent harness and identifies the
    // system actually making the request. For verdict content, the
    // caller must be a reviewer (evo/kyle/system) — squad agents
    // are blocked even if they try to attribute the verdict to a
    // reviewer. See _shared.ts:validateVerdictCaller for the cases.
    const callerCheck = validateVerdictCaller(
      getCallerFromHeader(req),
      input.content
    );
    if (!callerCheck.ok) {
      sendJson(res, 400, { error: callerCheck.error });
      return;
    }

    const id = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    const issueId = (input.issueId as string) ?? "";
    const content = (input.content as string) ?? "";
    const author = (input.author as string).trim();
    db.run(
      "INSERT INTO comments (id, issueId, content, author, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      [id, issueId, content, author, now, now]
    );
    await saveDb();

    const comment = {
      id,
      issueId,
      content,
      author,
      createdAt: now,
      updatedAt: now,
    };
    sendJson(res, 201, comment);

    // Look up the ticket so the emit payload has the same shape as other
    // ticket events (id, assignee, title, description) — required so the
    // jirito-event-injector's verify guard and routing logic work correctly.
    const ticketResult = db.exec("SELECT * FROM issues WHERE id = ?", [
      issueId,
    ]);
    const ticket =
      ticketResult.length > 0 && ticketResult[0].values.length > 0
        ? mapRow("issues", ticketResult[0].columns, ticketResult[0].values[0])
        : null;

    // JIRITO-124: include `projectKey` so comment wakes render the
    // correct project prefix (e.g. `ORCA-120` not `JIRITO-120`).
    const commentedProjectKey = getProjectKey(
      (ticket as { projectId?: string } | null)?.projectId
    );
    void emitEvent("ticket.commented", {
      id: ticket ? String(ticket.id) : issueId,
      assignee: (ticket?.assignee as string) ?? "",
      title: (ticket?.title as string) ?? "",
      description: (ticket?.description as string) ?? "",
      projectKey: commentedProjectKey,
      issueId,
      commentId: id,
      author,
      preview: content.slice(0, 100),
    });
  } catch (error) {
    console.error("create comment error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function update(
  req: IncomingMessage,
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

    // Same two-layer gate as `create` — an UPDATE that flips the
    // author to a name outside the allowlist (or a verdict that
    // flips the author to a non-reviewer, or a verdict posted by a
    // non-reviewer caller) is rejected with 400.
    const authorCheck = validateCommentAuthor(input.author, input.content);
    if (!authorCheck.ok) {
      sendJson(res, 400, { error: authorCheck.error });
      return;
    }
    const callerCheck = validateVerdictCaller(
      getCallerFromHeader(req),
      input.content
    );
    if (!callerCheck.ok) {
      sendJson(res, 400, { error: callerCheck.error });
      return;
    }

    const now = new Date().toISOString();
    db.run(
      "UPDATE comments SET content = ?, author = ?, updatedAt = ? WHERE id = ?",
      [input.content ?? "", (input.author as string).trim(), now, id]
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
