import { getDb, saveDb } from './index.js';

export function initTables() {
  const db = getDb();

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
      dueDate TEXT DEFAULT '',
      customColumnId TEXT DEFAULT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes for issues
  db.run('CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_issues_projectId ON issues(projectId)');
  db.run('CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee)');
  db.run('CREATE INDEX IF NOT EXISTS idx_issues_customColumnId ON issues(customColumnId)');

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
  const projectCount = db.exec('SELECT COUNT(*) as count FROM projects');
  if (projectCount[0].values[0][0] === 0) {
    db.run(
      "INSERT INTO projects (id, name, key, icon) VALUES ('default', 'Default Project', 'JIR', '🚀')"
    );
  }
  // Ensure metadata entries exist (idempotent)
  const hasCurrentProject = db.exec("SELECT COUNT(*) as count FROM metadata WHERE key = 'currentProject'");
  if (hasCurrentProject[0].values[0][0] === 0) {
    db.run("INSERT INTO metadata (key, value) VALUES ('currentProject', 'default')");
  }
  const hasIssueCounter = db.exec("SELECT COUNT(*) as count FROM metadata WHERE key = 'issueCounter'");
  if (hasIssueCounter[0].values[0][0] === 0) {
    db.run("INSERT INTO metadata (key, value) VALUES ('issueCounter', '1')");
  }

  saveDb();
  console.log('Database tables initialized successfully');
}

export function migrateTables() {
  const db = getDb();
  
  // Check if dueDate column exists
  const tableInfo = db.exec("PRAGMA table_info(issues)");
  if (tableInfo.length > 0) {
    const columns = tableInfo[0].values.map(row => row[1]);
    if (!columns.includes('dueDate')) {
      db.run("ALTER TABLE issues ADD COLUMN dueDate TEXT DEFAULT ''");
      console.log('Added dueDate column to issues table');
    }
    if (!columns.includes('customColumnId')) {
      db.run("ALTER TABLE issues ADD COLUMN customColumnId TEXT DEFAULT NULL");
      console.log('Added customColumnId column to issues table');
    }
  }
  
  saveDb();
}