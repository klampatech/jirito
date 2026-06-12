/**
 * SQLite database layer (sql.js wrapper).
 *
 * Provides lazy initialization, in-memory fallback, and a typed Database
 * handle. The `tryAddColumn` helper replaces the throw-away try/catch
 * around `ALTER TABLE ... ADD COLUMN` that was used in the original
 * pre-migration code.
 */

import initSqlJs, { type Database } from "sql.js";

let db: Database | null = null;
let dbPath: string | null = null;

/**
 * Add a column to a table, ignoring errors that indicate the operation
 * is a no-op: the column already exists, or the table does not yet exist
 * (the latter can happen when migrations run before `initTables`). All
 * other errors propagate.
 */
export function tryAddColumn(
  handle: Database,
  table: string,
  column: string,
  typeSql: string,
  defaultSql = ""
): void {
  const defaultClause = defaultSql ? ` DEFAULT ${defaultSql}` : "";
  try {
    handle.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}${defaultClause}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // SQLite returns:
    //   "duplicate column name: <col>"   when the column already exists
    //   "no such table: <table>"         when called pre-initTables
    if (
      !/duplicate column name/i.test(message) &&
      !/no such table/i.test(message)
    ) {
      throw err;
    }
  }
}

/**
 * Initialize the SQLite database.
 *
 * Loads from `JIRITO_DB_PATH` env var, or defaults to `./jirito.db`.
 * If the file doesn't exist, creates a new in-memory-backed database
 * that will be written on first `saveDb()` call.
 */
export async function initDb(): Promise<Database> {
  if (db) return db;

  const sqlLib = await initSqlJs();

  dbPath = process.env.JIRITO_DB_PATH || "./jirito.db";

  try {
    const fs = await import("node:fs");
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath);
      db = new sqlLib.Database(data);
      console.log(`Loaded database from ${dbPath}`);
    } else {
      db = new sqlLib.Database();
      console.log(`Created new database at ${dbPath}`);
    }
  } catch (err) {
    // If loading fails, start fresh
    db = new sqlLib.Database();
    console.warn(
      `Could not load database: ${err instanceof Error ? err.message : String(err)}. Starting fresh.`
    );
  }

  if (!db) {
    throw new Error("Database failed to initialise");
  }

  // Enable WAL mode for better concurrent read performance
  db.run("PRAGMA journal_mode=WAL");
  // Enable foreign keys
  db.run("PRAGMA foreign_keys=ON");

  // Migrations for the issues table. Each call is a no-op if the column
  // already exists.
  tryAddColumn(db, "issues", "type", "TEXT", "'task'");
  tryAddColumn(db, "issues", "rank", "REAL", "0");

  return db;
}

/** Get the current database instance, or `null` if not yet initialised. */
export function getDb(): Database | null {
  return db;
}

/**
 * Save the database to disk. Serializes the current state and writes to
 * `JIRITO_DB_PATH`. A no-op if the database has not been initialised.
 */
let fs: typeof import("node:fs") | null = null;

export async function saveDb(): Promise<void> {
  if (!db || !dbPath) return;
  try {
    if (!fs) fs = await import("node:fs");
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error("Failed to save database:", err);
  }
}

/** Close the database connection. */
export function closeDb(): void {
  if (db) {
    void saveDb();
    db.close();
    db = null;
  }
}
