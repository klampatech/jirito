// ===== Trash Routes =====
// GET    /api/trash                  — list trash items
// POST   /api/trash/:id/restore      — restore a trash item
// DELETE /api/trash/:id/purge        — permanently remove a trash item
// DELETE /api/trash/:id              — remove a trash item (alias for purge)

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
    const trash = queryAll('SELECT * FROM trash ORDER BY date DESC');
    const trashItems = trash.map(t => ({
      ...t,
      date: t.date,
    }));
    sendJson(res, 200, trashItems);
  } catch (error) {
    console.error('getAll trash error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function restore(req, res, id) {
  try {
    const db = getDb();

    // Get trash item
    const trashResult = db.exec('SELECT * FROM trash WHERE id = ?', [id]);
    if (trashResult.length === 0 || trashResult[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Trash item not found' });
    }

    const cols = trashResult[0].columns;
    const row = trashResult[0].values[0];
    const trashItem = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        trashItem[col] = parseJsonColumn(value);
      } else {
        trashItem[col] = value;
      }
    });

    const type = trashItem.type;
    const data = trashItem.data;

    if (type === 'issue' && data) {
      // Restore issue
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO issues (id, title, description, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, parentIssueId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          data.title || '',
          data.description || '',
          data.status || 'backlog',
          data.priority || 'medium',
          JSON.stringify(data.labels || []),
          data.assignee || '',
          data.reporter || '',
          data.projectId || 'default',
          data.sprintId || null,
          data.storyPoints || 0,
          data.parentIssueId || null,
          data.createdAt || now,
          now,
        ]
      );
    } else if (type === 'project' && data) {
      // Restore project
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO projects (id, name, key, icon, color, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [data.id, data.name, data.key, data.icon, data.color, data.description, data.createdAt || now, now]
      );
    }

    // Remove from trash
    db.run('DELETE FROM trash WHERE id = ?', [id]);

    await saveDb();

    sendJson(res, 200, { success: true, message: `${type} restored` });
  } catch (error) {
    console.error('restore trash error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function purge(req, res, id) {
  try {
    const db = getDb();

    // Get trash item before removing
    const trashResult = db.exec('SELECT * FROM trash WHERE id = ?', [id]);
    let trashItem = null;
    if (trashResult.length > 0 && trashResult[0].values.length > 0) {
      const cols = trashResult[0].columns;
      const row = trashResult[0].values[0];
      trashItem = {};
      cols.forEach((col, i) => {
        const value = row[i];
        if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
          trashItem[col] = parseJsonColumn(value);
        } else {
          trashItem[col] = value;
        }
      });
    }

    // Remove from trash
    db.run('DELETE FROM trash WHERE id = ?', [id]);

    await saveDb();

    sendJson(res, 200, { success: true, message: `Trash item purged` });
  } catch (error) {
    console.error('purge trash error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function remove(req, res, id) {
  // Alias for purge — just remove the trash entry
  try {
    const db = getDb();
    db.run('DELETE FROM trash WHERE id = ?', [id]);
    await saveDb();
    sendJson(res, 200, { success: true, message: 'Trash item removed' });
  } catch (error) {
    console.error('remove trash error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { getAll, restore, purge, remove };
