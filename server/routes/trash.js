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
      if (col === 'data' && typeof row[i] === 'string') {
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
      const trashItems = queryAll('SELECT * FROM trash ORDER BY date DESC');
      sendJson(res, 200, trashItems);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  restore: async (req, res, id) => {
    try {
      const db = getDb();
      const trashItem = queryAll('SELECT * FROM trash WHERE id = ?', [id]);

      if (!trashItem[0]) {
        return sendJson(res, 404, { error: 'Trash item not found' });
      }

      const item = trashItem[0];
      const data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;

      // Restore based on type
      if (item.type === 'issue') {
        // Check if issue already exists
        const existing = db.exec('SELECT id FROM issues WHERE id = ?', [data.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
          db.run(
            `INSERT INTO issues (id, title, description, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, parentIssueId, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.id,
              data.title,
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
              data.createdAt || new Date().toISOString(),
              new Date().toISOString(),
            ]
          );
        }
      } else if (item.type === 'project') {
        const existing = db.exec('SELECT id FROM projects WHERE id = ?', [data.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
          db.run(
            'INSERT INTO projects (id, name, key, icon, color, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [data.id, data.name, data.key, data.icon, data.color, data.description, new Date().toISOString(), new Date().toISOString()]
          );
        }
      } else if (item.type === 'sprint') {
        const existing = db.exec('SELECT id FROM sprints WHERE id = ?', [data.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
          db.run(
            'INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [data.id, data.projectId, data.name, data.status, data.startDate, data.endDate, data.goal, new Date().toISOString(), new Date().toISOString()]
          );
        }
      }

      // Remove from trash
      db.run('DELETE FROM trash WHERE id = ?', [id]);
      saveDb();

      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  remove: async (req, res, id) => {
    try {
      const db = getDb();
      db.run('DELETE FROM trash WHERE id = ?', [id]);
      saveDb();
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  purge: async (req, res) => {
    try {
      const db = getDb();
      db.run('DELETE FROM trash');
      saveDb();
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },
};

export default router;