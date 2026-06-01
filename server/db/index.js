// ===== SQLite Database Layer =====
// Wraps sql.js for in-process SQLite persistence.

import initSqlJs from 'sql.js';

let db = null;
let dbPath = null;

/**
 * Initialize the SQLite database.
 * Loads from JIRITO_DB_PATH env var, or defaults to './jirito.db'.
 * If the file doesn't exist, creates a new in-memory-backed database
 * that will be written on first saveDb() call.
 */
export async function initDb() {
  if (db) return db;

  const sqlLib = await initSqlJs();

  dbPath = process.env.JIRITO_DB_PATH || './jirito.db';

  try {
    const fs = await import('fs');
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
    console.warn(`Could not load database: ${err.message}. Starting fresh.`);
  }

  // Enable WAL mode for better concurrent read performance
  db.run('PRAGMA journal_mode=WAL');
  // Enable foreign keys
  db.run('PRAGMA foreign_keys=ON');

  return db;
}

/**
 * Get the current database instance.
 */
export function getDb() {
  return db;
}

/**
 * Save the database to disk.
 * Serializes the current state and writes to JIRITO_DB_PATH.
 */
let fs = null;

export async function saveDb() {
  if (!db || !dbPath) return;
  try {
    if (!fs) fs = await import('fs');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

/**
 * Close the database connection.
 */
export function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
