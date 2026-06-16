/**
 * Database schema setup and migrations.
 *
 * `initTables` is idempotent (uses `IF NOT EXISTS`). `migrateTables` is
 * idempotent too -- it inspects the current schema with `PRAGMA table_info`
 * before issuing each `ALTER TABLE`.
 */

import { getDb, saveDb } from "./index.js";
import { tryAddColumn } from "./index.js";

export function initTables(): void {
  const db = getDb();
  if (!db) throw new Error("DB not initialised");

  // Issues table - core entity
  db.run(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      type TEXT DEFAULT 'task',
      status TEXT DEFAULT 'backlog',
      priority TEXT DEFAULT 'medium',
      labels TEXT DEFAULT '[]',
      assignee TEXT DEFAULT '',
      reporter TEXT DEFAULT '',
      projectId TEXT,
      sprintId TEXT,
      storyPoints INTEGER DEFAULT 0,
      rank REAL DEFAULT 0,
      parentIssueId TEXT,
      prUrl TEXT DEFAULT '',
      dueDate TEXT DEFAULT '',
      customColumnId TEXT DEFAULT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // Indexes for issues
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_issues_projectId ON issues(projectId)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee)"
  );
  // NB: idx_issues_customColumnId is created by migrateTables(), not here.
  // On an old DB that predates the customColumnId feature, the column is
  // missing — creating the index on it here would throw
  // "no such column: customColumnId" before migrateTables gets a chance
  // to add the column. See migrateTables() for the index creation.

  // Comments table
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      content TEXT DEFAULT '',
      author TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (issueId) REFERENCES issues(id) ON DELETE CASCADE
    )
  `);

  // Projects table
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT,
      icon TEXT DEFAULT '🚀',
      color TEXT DEFAULT '#0052CC',
      description TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // Sprints table
  db.run(`
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      startDate TEXT,
      endDate TEXT,
      goal TEXT DEFAULT '',
      active INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Activity log table
  db.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      issueId TEXT,
      action TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      time TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (issueId) REFERENCES issues(id) ON DELETE SET NULL
    )
  `);

  // Trash table for soft-deleted items
  db.run(`
    CREATE TABLE IF NOT EXISTS trash (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      date TEXT DEFAULT (datetime('now'))
    )
  `);

  // Saved filters table
  db.run(`
    CREATE TABLE IF NOT EXISTS filters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT DEFAULT '{}',
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // Webhook outbox — durable queue for webhook events (Phase 2 writes, Phase 4 drains)
  db.run(`
    CREATE TABLE IF NOT EXISTS webhook_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      delivered_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_outbox_status_created
      ON webhook_outbox(status, created_at)
  `);

  // Custom columns table for Kanban boards
  db.run(`
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT DEFAULT '{}',
      projectId TEXT,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);

  // Metadata table for app settings
  db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Create default project if none exists
  const projectCount = db.exec("SELECT COUNT(*) as count FROM projects");
  if (projectCount[0].values[0][0] === 0) {
    db.run(
      "INSERT INTO projects (id, name, key, icon) VALUES ('default', 'Default Project', 'JIR', '🚀')"
    );
  }
  // Ensure metadata entries exist (idempotent)
  const hasCurrentProject = db.exec(
    "SELECT COUNT(*) as count FROM metadata WHERE key = 'currentProject'"
  );
  if (hasCurrentProject[0].values[0][0] === 0) {
    db.run(
      "INSERT INTO metadata (key, value) VALUES ('currentProject', 'default')"
    );
  }
  const hasIssueCounter = db.exec(
    "SELECT COUNT(*) as count FROM metadata WHERE key = 'issueCounter'"
  );
  if (hasIssueCounter[0].values[0][0] === 0) {
    db.run(
      "INSERT INTO metadata (key, value) VALUES ('issueCounter', '1')"
    );
  }

  saveDb();
  console.log("Database tables initialized successfully");
}

export function migrateTables(): void {
  const db = getDb();
  if (!db) throw new Error("DB not initialised");

  // Inspect the current schema; add any missing columns.
  const tableInfo = db.exec("PRAGMA table_info(issues)");
  if (tableInfo.length > 0) {
    const columns = tableInfo[0].values.map((row) => String(row[1]));
    if (!columns.includes("dueDate")) {
      tryAddColumn(db, "issues", "dueDate", "TEXT", "''");
      console.log("Added dueDate column to issues table");
    }
    if (!columns.includes("customColumnId")) {
      tryAddColumn(db, "issues", "customColumnId", "TEXT", "NULL");
      console.log("Added customColumnId column to issues table");
    }
    if (!columns.includes("prUrl")) {
      tryAddColumn(db, "issues", "prUrl", "TEXT", "''");
      console.log("Added prUrl column to issues table");
    }
  }

  // The sprints table was missing the `active` and `archived` boolean
  // columns before the phase-7 schema fix. The CREATE TABLE above
  // already includes them for fresh DBs; this migration adds them
  // to older DBs that were created before the fix. Both columns are
  // INTEGER (0/1) in SQLite, matching the boolean semantics the
  // frontend uses for `s.active` and `s.archived` in its sprint
  // objects. The legacy localStorage-only persistence wrote the
  // full object as JSON, so these fields existed in client state
  // even when they had no server-side column.
  const sprintInfo = db.exec("PRAGMA table_info(sprints)");
  if (sprintInfo.length > 0) {
    const sprintCols = sprintInfo[0].values.map((row) => String(row[1]));
    if (!sprintCols.includes("active")) {
      tryAddColumn(db, "sprints", "active", "INTEGER", "0");
      console.log("Added active column to sprints table");
    }
    if (!sprintCols.includes("archived")) {
      tryAddColumn(db, "sprints", "archived", "INTEGER", "0");
      console.log("Added archived column to sprints table");
    }
  }

  // Indexes that depend on columns that migrateTables() may have just
  // added. The customColumnId index in particular cannot be created
  // inside initTables() because the column may not exist on an older DB
  // (initTables uses CREATE TABLE IF NOT EXISTS, which is a no-op when
  // the table already exists, so the column won't be there yet).
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_issues_customColumnId ON issues(customColumnId)"
  );

  saveDb();
}
