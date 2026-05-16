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
  getAll: async (req, res) => {
    try {
      const projects = queryAll('SELECT * FROM projects ORDER BY createdAt ASC');
      sendJson(res, 200, projects);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  getCurrent: async (req, res) => {
    try {
      const db = getDb();
      const result = db.exec("SELECT value FROM metadata WHERE key = 'currentProject'");
      const currentProjectId = result.length > 0 ? result[0].values[0][0] : 'default';
      const project = queryAll('SELECT * FROM projects WHERE id = ?', [currentProjectId]);
      sendJson(res, 200, project[0] || null);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  setCurrent: async (req, res, data) => {
    try {
      const db = getDb();
      if (data.currentProject) {
        db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)", 
          [data.currentProject]);
        saveDb();
      }
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  create: async (req, res, data) => {
    try {
      const db = getDb();
      const id = data.id || `proj_${Date.now()}`;
      const now = new Date().toISOString();

      db.run(
        'INSERT INTO projects (id, name, key, icon, color, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          data.name || 'New Project',
          data.key || '',
          data.icon || '🚀',
          data.color || '#0052CC',
          data.description || '',
          now,
          now,
        ]
      );

      saveDb();
      const project = queryAll('SELECT * FROM projects WHERE id = ?', [id]);
      sendJson(res, 201, project[0]);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  update: async (req, res, id, data) => {
    try {
      const db = getDb();
      const fields = [];
      const values = [];

      const allowedFields = ['name', 'key', 'icon', 'color', 'description'];
      
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

      const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
      db.run(sql, values);
      saveDb();

      const project = queryAll('SELECT * FROM projects WHERE id = ?', [id]);
      if (!project[0]) {
        return sendJson(res, 404, { error: 'Project not found' });
      }
      sendJson(res, 200, project[0]);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  remove: async (req, res, id) => {
    try {
      const db = getDb();

      // Check if this is the only project
      const count = db.exec('SELECT COUNT(*) as count FROM projects');
      if (count[0].values[0][0] <= 1) {
        return sendJson(res, 400, { error: 'Cannot delete the only project' });
      }

      // Move to trash
      const project = queryAll('SELECT * FROM projects WHERE id = ?', [id]);
      if (!project[0]) {
        return sendJson(res, 404, { error: 'Project not found' });
      }

      const trashId = `trash_${Date.now()}`;
      db.run(
        'INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)',
        [trashId, 'project', JSON.stringify(project[0]), new Date().toISOString()]
      );

      // Delete project and its issues
      db.run('DELETE FROM issues WHERE projectId = ?', [id]);
      db.run('DELETE FROM projects WHERE id = ?', [id]);
      saveDb();

      // Set a different project as current
      const remaining = db.exec('SELECT id FROM projects LIMIT 1');
      if (remaining.length > 0) {
        db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)",
          [remaining[0].values[0][0]]);
        saveDb();
      }

      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },
};

export default router;