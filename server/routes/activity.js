// ===== Activity Log Routes =====
// GET  /api/activity  — get activity log
// POST /api/activity  — add activity entry

import { getDb, saveDb } from '../db/index.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function queryAll(sql, params = []) {
  const db = getDb();
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        obj[col] = parseJsonColumn(value);
      } else {
        obj[col] = value;
      }
    });
    return obj;
  });
}

export async function getAll(req, res) {
  try {
    const limit = parseInt(new URL(req.url, `http://${req.headers.host}`).searchParams.get('limit')) || 100;
    const activity = queryAll(`SELECT * FROM activity ORDER BY time DESC LIMIT ${limit}`);
    sendJson(res, 200, activity);
  } catch (error) {
    console.error('getAll activity error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function create(req, res, body) {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    db.run(
      'INSERT INTO activity (id, issueId, action, details, time) VALUES (?, ?, ?, ?, ?)',
      [
        id,
        body.issueId || null,
        body.action || '',
        typeof body.details === 'string' ? body.details : JSON.stringify(body.details || {}),
        now,
      ]
    );

    await saveDb();

    sendJson(res, 201, {
      id,
      issueId: body.issueId || null,
      action: body.action || '',
      details: body.details || {},
      time: now,
    });
  } catch (error) {
    console.error('create activity error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { getAll, create };
