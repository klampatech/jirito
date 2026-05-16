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
      obj[col] = row[i];
    });
    return obj;
  });
}

const router = {
  getByProject: async (req, res, projectId) => {
    try {
      const sprints = queryAll(
        'SELECT * FROM sprints WHERE projectId = ? ORDER BY createdAt ASC',
        [projectId]
      );
      sendJson(res, 200, sprints);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  create: async (req, res, data) => {
    try {
      const db = getDb();
      const id = data.id || `sprint_${Date.now()}`;
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.projectId || 'default',
          data.name || 'New Sprint',
          data.status || 'active',
          data.startDate || null,
          data.endDate || null,
          data.goal || '',
          now,
          now,
        ]
      );

      saveDb();
      const sprint = queryAll('SELECT * FROM sprints WHERE id = ?', [id]);
      sendJson(res, 201, sprint[0]);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  update: async (req, res, id, data) => {
    try {
      const db = getDb();
      const fields = [];
      const values = [];

      const allowedFields = ['name', 'status', 'startDate', 'endDate', 'goal'];
      
      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(data[field]);
        }
      }

      if (fields.length === 0) {
        return sendJson(res, 400, { error: 'No fields to update' });
      }

      fields.push('updatedAt = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const sql = `UPDATE sprints SET ${fields.join(', ')} WHERE id = ?`;
      db.run(sql, values);
      saveDb();

      const sprint = queryAll('SELECT * FROM sprints WHERE id = ?', [id]);
      if (!sprint[0]) {
        return sendJson(res, 404, { error: 'Sprint not found' });
      }
      sendJson(res, 200, sprint[0]);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  remove: async (req, res, id) => {
    try {
      const db = getDb();

      // Remove sprint from issues
      db.run('UPDATE issues SET sprintId = NULL WHERE sprintId = ?', [id]);

      // Move to trash
      const sprint = queryAll('SELECT * FROM sprints WHERE id = ?', [id]);
      if (!sprint[0]) {
        return sendJson(res, 404, { error: 'Sprint not found' });
      }

      const trashId = `trash_${Date.now()}`;
      db.run(
        'INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)',
        [trashId, 'sprint', JSON.stringify(sprint[0]), new Date().toISOString()]
      );

      db.run('DELETE FROM sprints WHERE id = ?', [id]);
      saveDb();

      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },
};

export default router;