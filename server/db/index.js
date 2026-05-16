import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let dbPath = null;

const DB_PATH = process.env.JIRITO_DB_PATH || path.join(process.cwd(), 'jirito.db');

export async function initDb() {
  if (db) return db;

  // Ensure directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Initialize SQL.js with WASM
  const SQL = await initSqlJs({
    locateFile: (file) => {
      // sql.js looks for sql-wasm.wasm by default
      if (file === 'sql-wasm.wasm') {
        return path.join(process.cwd(), 'server', 'sqlite.wasm');
      }
      return path.join(process.cwd(), 'server', file);
    },
  });

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  dbPath = DB_PATH;
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function saveDb() {
  if (!db || !dbPath) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}