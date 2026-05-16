import { getDb, saveDb } from '../db/index.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function queryAll(sql, params = []) {
  const db = getDb();
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, i) => {
      if (col === 'details' && typeof row[i] === 'string') {
        try {
          obj[col] = JSON.parse(row[i]);
        } catch {
          obj[col] = row[i];
        }
      } else {
        obj[col] = row[i];
      }
    });
    return obj;
  });
}

const router = {
  getAll: async (req, res) => {
    try {
      const activities = queryAll(
        'SELECT * FROM activity ORDER BY time DESC LIMIT 100'
      );
      sendJson(res, 200, activities);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  create: async (req, res, data) => {
    try {
      const db = getDb();
      const id = data.id || `activity_${Date.now()}`;
      const now = new Date().toISOString();

      db.run(
        'INSERT INTO activity (id, issueId, action, details, time) VALUES (?, ?, ?, ?, ?)',
        [
          id,
          data.issueId || null,
          data.action || '',
          typeof data.details === 'string' ? data.details : JSON.stringify(data.details || {}),
          data.time || now,
        ]
      );

      saveDb();
      const activity = queryAll('SELECT * FROM activity WHERE id = ?', [id]);
      sendJson(res, 201, activity[0]);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  clear: async (req, res) => {
    try {
      const db = getDb();
      db.run('DELETE FROM activity');
      saveDb();
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },
};

export default router;