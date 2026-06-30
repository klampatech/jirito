/**
 * Shared helpers used by every route module.
 *
 * Before this file existed, each route module had its own copy of
 * `sendJson`, `parseJsonColumn`, and `queryAll`. They were byte-for-byte
 * identical. This file is the single source of truth and is imported by
 * all routes.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database, QueryExecResult } from "sql.js";
import { getDb } from "../db/index.js";

// Re-declared locally because @types/sql.js does not export SqlValue.
// Matches the upstream definition: number | string | Uint8Array | null.
type SqlValue = number | string | Uint8Array | null;

/**
 * Helper: read a single scalar value from the metadata table.
 * Returns `defaultValue` if the key is missing or the DB is uninitialised.
 * Exported so any route can read state stored via INSERT OR REPLACE INTO
 * metadata (currentProject, issueCounter, defaultColumnOverrides, etc.).
 */
export function readMetadata(key: string, defaultValue: string): string {
  const db = getDb();
  if (!db) return defaultValue;
  const result = db.exec("SELECT value FROM metadata WHERE key = ?", [key]);
  if (result.length === 0) return defaultValue;
  return String(result[0].values[0][0] ?? defaultValue);
}

/**
 * Helper: write a scalar value to the metadata table (upsert).
 * Used by route handlers that need to persist per-user state (currentView,
 * currentProject overrides, etc.) without taking on a full-state sync.
 */
export function writeMetadata(key: string, value: string): void {
  const db = getDb();
  if (!db) return;
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", [
    key,
    value,
  ]);
}

/**
 * Look up the `key` column of a project by its `id`. Returns the raw
 * `key` value if found, otherwise the `id` itself (the conventional
 * fallback — the column model already does this on the client side).
 *
 * 2026-06-30 (JIRITO-124): squad wakes / PR body templates previously
 * hardcoded `JIRITO-` as the ticket prefix, which made a ticket
 * created in the ORCA project appear as `JIRITO-120` to the receiving
 * agent. The agent then named its branch and PR using `jirito-…`
 * and pushed to the wrong repo. The fix: every ticket.* event payload
 * carries `projectKey` (computed at emit time from the projects
 * table) so downstream consumers render the proper
 * `ORCA-120` / `JIRITO-119` prefix without an extra fetch.
 */
export function getProjectKey(projectId: string | null | undefined): string {
  if (!projectId) return "PROJ";
  const db = getDb();
  if (!db) return projectId;
  const result = db.exec("SELECT key FROM projects WHERE id = ?", [projectId]);
  if (result.length === 0 || result[0].values.length === 0) return projectId;
  const key = result[0].values[0][0];
  return typeof key === "string" && key ? key : projectId;
}

/**
 * Canonical issue status enum used by the client's 4-column board.
 * Anything else gets normalized via STATUS_ALIASES (or rejected).
 *
 * Burn 2026-06-20: elmo's harness occasionally emitted status="in_progress"
 * (with underscore) instead of "inprogress". The server used to accept
 * it silently. The board view filter `i.status === colDef.status` then
 * returned false for every default column, hiding the ticket from the
 * board while still showing it in list view (which doesn't filter through
 * the column model). Normalize aliases here so any caller — CLI, harness,
 * direct curl — ends up with a value the client can render.
 */
export const VALID_STATUSES: ReadonlySet<string> = new Set([
  "todo",
  "inprogress",
  "review",
  "done",
  "trash",
]);

export const STATUS_ALIASES: Readonly<Record<string, string>> = {
  in_progress: "inprogress",
  "in-progress": "inprogress",
  in_review: "review",
  "in-review": "review",
  backlog: "todo",
};

export function normalizeStatus(raw: unknown): string {
  if (typeof raw !== "string") return "todo";
  const aliased = STATUS_ALIASES[raw] ?? raw;
  return VALID_STATUSES.has(aliased) ? aliased : "todo";
}

/**
 * Which columns on which tables hold JSON-encoded strings that should be
 * auto-parsed by `mapRow`. Lookup is case-insensitive on the column name.
 */
const JSON_COLUMNS_BY_TABLE: Readonly<Record<string, ReadonlySet<string>>> = {
  issues: new Set(["labels"]),
  filters: new Set(["query"]),
  activity: new Set(["details"]),
  trash: new Set(["data"]),
  columns: new Set(["query"]),
};

/**
 * Which columns on which tables hold SQLite-style booleans (INTEGER 0/1)
 * that should be exposed to clients as real `boolean`. Without this
 * auto-conversion, callers would see `prMerged: 1` (number) when the
 * TypeScript `Issue` interface declares `prMerged?: boolean` (boolean),
 * causing silent type drift and `Boolean(1) === true` accidents.
 *
 * Keys are stored lowercase to match `isBooleanColumn`'s case-insensitive
 * lookup (the column names from `SELECT *` come back in whatever case the
 * schema declared — usually the canonical camelCase from init.ts).
 *
 * JIRITO-120: added so the detail-panel "PR merged" toggle round-trips
 * through PUT/GET without client-side coercion. The sprint `active` /
 * `archived` flags share the same pattern (added earlier per the
 * migrateTables comment).
 */
const BOOLEAN_COLUMNS_BY_TABLE: Readonly<Record<string, ReadonlySet<string>>> = {
  issues: new Set(["prmerged"]),
  sprints: new Set(["active", "archived"]),
};

const FALLBACK_JSON_COLUMNS: ReadonlySet<string> = new Set([
  "labels",
  "query",
  "details",
  "data",
  "description",
  "goal",
]);

function isJsonColumn(tableName: string, columnName: string): boolean {
  const tableSet = JSON_COLUMNS_BY_TABLE[tableName];
  const col = columnName.toLowerCase();
  if (tableSet) return tableSet.has(col);
  return FALLBACK_JSON_COLUMNS.has(col);
}

/** Send a JSON response. The body is serialised; status is 200 by default. */
export function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

/**
 * Parse a JSON column value. SQLite returns the value as a string; we
 * JSON.parse it. If parsing fails, the raw value is returned so the caller
 * can still see what was stored.
 */
export function parseJsonColumn(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Build a row object from a `QueryExecResult` row, parsing JSON columns
 * for the given table name. Centralised so every route gets identical
 * behaviour.
 */
export function mapRow(
  tableName: string,
  cols: string[],
  row: unknown[]
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const value = row[i];
    if (isJsonColumn(tableName, col)) {
      obj[col] = parseJsonColumn(value);
    } else if (isBooleanColumn(tableName, col)) {
      // Coerce SQLite INTEGER 0/1 → real boolean. `!!value` keeps the
      // JSON.stringify-compatible shape (no `Boolean` wrapper object)
      // and rejects null/empty gracefully (becomes false).
      obj[col] = Boolean(value);
    } else {
      obj[col] = value;
    }
  }
  return obj;
}

function isBooleanColumn(tableName: string, columnName: string): boolean {
  const tableSet = BOOLEAN_COLUMNS_BY_TABLE[tableName];
  if (!tableSet) return false;
  return tableSet.has(columnName.toLowerCase());
}

/**
 * Run a SELECT-style query and return the rows as plain objects. Throws
 * if the database has not been initialised.
 */
export function queryAll(
  sql: string,
  params: SqlValue[] = []
): Record<string, unknown>[] {
  const db: Database | null = getDb();
  if (!db) {
    throw new Error("Database not initialised");
  }
  const result: QueryExecResult[] = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return [];

  // We don't have a tableName here. Best-effort: use the FROM clause as a
  // hint. For the routes that use `queryAll` directly, they pass the
  // `mapRow` explicitly. Otherwise, we fall back to the legacy list.
  const tableHint = extractTableName(sql);
  return result[0].values.map((row: unknown[]) =>
    mapRow(tableHint ?? "", result[0].columns, row)
  );
}

/**
 * Best-effort extraction of the table name from a SELECT's FROM clause.
 * Returns `null` if it can't be parsed. Used only as a hint to pick the
 * right JSON-column allowlist.
 */
function extractTableName(sql: string): string | null {
  const match = sql.match(
    /from\s+([a-zA-Z_][a-zA-Z0-9_]*)/i
  );
  return match ? match[1].toLowerCase() : null;
}

/**
 * Convenience: coerce a string `id` column that is purely numeric to a
 * number. The frontend expects `id: number` for newly-created issues but
 * the database stores them as strings to keep IDs portable.
 */
export function coerceNumericId<T extends Record<string, unknown>>(row: T): T {
  if (
    row &&
    typeof row.id === "string" &&
    /^-?\d+$/.test(row.id)
  ) {
    return { ...row, id: Number(row.id) };
  }
  return row;
}

/**
 * Author allowlist for comments. The set is the single source of truth
 * for "who is allowed to post a comment to jirito" and matches the
 * agents + reviewer + human + system authors used by `bin/jirito` and
 * the jirito-event-injector.
 *
 * Why: prior to 2026-06-20, `POST /api/comments` accepted any string
 * for `author`. The squad agents could — and one did — post comments
 * under a different agent's name (JIRITO-101: elmo posted a "Review
 * verdict: PASS" comment with `author="evo"` because my retry brief
 * was wrong and elmo rubber-stamped the existing PR instead of
 * pushing back). Burn 2026-06-20.
 */
export const VALID_AUTHORS: ReadonlySet<string> = new Set([
  // 4 squad agents
  "elmo", "bert", "ernie", "grover",
  // reviewer (Evo) and human (Kyle)
  "evo", "kyle",
  // synthetic comments from server-side flows
  // (e.g. `bin/jirito cmd_triage` posts "[auto] Triaged to X." with
  // author="system")
  "system",
]);

/**
 * Authors allowed to post a review-verdict comment. Verdict comments
 * are recognised by content (see `isVerdictComment`). Without this
 * rule an agent could post a fake PASS verdict under the reviewer's
 * name even after the VALID_AUTHORS gate accepts the author string.
 */
export const REVIEWER_AUTHORS: ReadonlySet<string> = new Set([
  "evo", "kyle", "system",
]);

/**
 * Caller identifiers (X-Jirito-Caller header) that represent squad
 * agents and are subject to the close-verification gate. Humans
 * (kyle) and the parent agent (evo) are exempt — they can move
 * tickets to `done`/`trash` without providing a `verification`
 * field, because they're either consciously closing or have a
 * downstream review path.
 *
 * Burn 2026-06-21 (JIRITO-101 / "already handled"): elmo moved
 * #101 to inprogress, created a branch, then declared "Already
 * handled — continuing with the bug fix" without reproducing in
 * the browser. Skill-level Path C enforcement existed but agents
 * can skip skill instructions. The API-level close gate below
 * (see issues.ts `update`) is the structural fix that turns the
 * "verification required" rule from prose into a hard pre-condition
 * on the close transition itself.
 */
export const AGENT_CALLERS: ReadonlySet<string> = new Set([
  "elmo", "bert", "ernie", "grover",
]);

/**
 * Detect a review-verdict comment. These signal "this work has been
 * reviewed and approved/rejected" and must come from REVIEWER_AUTHORS.
 *
 * Matched prefixes (case-insensitive, leading whitespace allowed):
 *  - "Review verdict: PASS" / "Review verdict: FAIL"
 *  - "Evo review: <verdict>" / "Evo review (rejected): ..."
 *  - "Review (rejected): ..."
 */
export function isVerdictComment(content: string | null | undefined): boolean {
  if (!content) return false;
  return /^\s*(review verdict|evo review|review \(rejected\))/i.test(content);
}

/**
 * Validate a comment author (and content) before insert/update. Returns
 * `{ ok: true }` on success or `{ ok: false, error }` with a stable
 * 400-class message on failure.
 *
 * Rules (added 2026-06-20 after the JIRITO-101 impersonation burn):
 *  1. `author` is required and must be in `VALID_AUTHORS`.
 *  2. If the content is a verdict comment, `author` must additionally
 *     be in `REVIEWER_AUTHORS`. This stops agents from rubber-stamping
 *     their own work under a reviewer's name.
 */
export function validateCommentAuthor(
  author: unknown,
  content: unknown
): { ok: true } | { ok: false; error: string } {
  const a = typeof author === "string" ? author.trim() : "";
  if (!a) {
    return { ok: false, error: "author is required" };
  }
  if (!VALID_AUTHORS.has(a)) {
    return { ok: false, error: `unknown author: ${a}` };
  }
  const c = typeof content === "string" ? content : "";
  if (isVerdictComment(c) && !REVIEWER_AUTHORS.has(a)) {
    return {
      ok: false,
      error: `verdict comments must be posted by a reviewer (evo/kyle/system), got: ${a}`,
    };
  }
  return { ok: true };
}

/**
 * Read the request's caller identity from the `X-Jirito-Caller` header.
 *
 * The caller is the SYSTEM ACTOR making the request — distinct from
 * the comment's displayed `author`. The CLI sets it to whoever
 * invoked it (kyle by default, overridable via `JIRITO_CALLER`).
 * The jirito-event-injector / agent harnesses set it to the agent's
 * own name. The body's `author` is the comment's label; the header
 * is who actually pressed the button.
 *
 * HTTP header names are case-insensitive. Returns the trimmed value
 * or `null` if the header is absent / empty.
 */
export function getCallerFromHeader(req: IncomingMessage): string | null {
  const raw = req.headers["x-jirito-caller"];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate the caller (from `X-Jirito-Caller`) for verdict comments.
 * Returns `{ ok: true }` for non-verdict content (no caller check
 * needed) or `{ ok: false, error }` if a verdict was posted without
 * a reviewer-class caller.
 *
 * This is the SECOND LAYER of the JIRITO-101 fix. The first layer
 * (`validateCommentAuthor`) checks the body field, which can be
 * spoofed. This layer checks the request's actual caller, which
 * only legitimate processes can set. Combined:
 *
 *   - elmo (caller=elmo) posts verdict with body author=evo
 *     → validateCommentAuthor: PASSES (evo is in REVIEWER_AUTHORS)
 *     → validateVerdictCaller:  FAILS (elmo is not a reviewer)
 *     → 400 ✓ (the original burn, now closed)
 *
 *   - kyle (caller=kyle) posts verdict with body author=evo
 *     → validateCommentAuthor: PASSES
 *     → validateVerdictCaller:  PASSES (kyle is a reviewer)
 *     → 201 (kyle posting on behalf of evo — fine)
 *
 *   - elmo (caller=elmo) posts regular comment with body author=elmo
 *     → validateCommentAuthor: PASSES (elmo is in VALID_AUTHORS)
 *     → validateVerdictCaller:  N/A (not a verdict)
 *     → 201 (regular agent comment — fine)
 */
export function validateVerdictCaller(
  caller: string | null,
  content: unknown
): { ok: true } | { ok: false; error: string } {
  const c = typeof content === "string" ? content : "";
  if (!isVerdictComment(c)) {
    // No caller check needed for non-verdict content.
    return { ok: true };
  }
  if (!caller) {
    return {
      ok: false,
      error:
        "verdict comments require an X-Jirito-Caller header (evo/kyle/system)",
    };
  }
  if (!REVIEWER_AUTHORS.has(caller)) {
    return {
      ok: false,
      error: `verdict comments must be posted by a reviewer caller (evo/kyle/system), got: ${caller}`,
    };
  }
  return { ok: true };
}

/** Read the request body as JSON. Throws on invalid JSON. */
export function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer | string) => {
      body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
