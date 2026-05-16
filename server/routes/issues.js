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
      // Parse JSON fields
      if (col === 'labels' && typeof row[i] === 'string') {
        try {
          obj[col] = JSON.parse(row[i]);
        } catch {
          obj[col] = [];
        }
      } else {
        obj[col] = row[i];
      }
    });
    return obj;
  });
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

const router = {
  getAll: async (req, res, url) => {
    try {
      const projectId = url.searchParams.get('projectId');
      let sql = 'SELECT * FROM issues';
      const params = [];
      if (projectId) {
        sql += ' WHERE projectId = ?';
        params.push(projectId);
      }
      sql += ' ORDER BY createdAt DESC';
      const issues = queryAll(sql, params);
      sendJson(res, 200, issues);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  getById: async (req, res, id) => {
    try {
      const issue = queryOne('SELECT * FROM issues WHERE id = ?', [id]);
      if (!issue) {
        return sendJson(res, 404, { error: 'Issue not found' });
      }
      sendJson(res, 200, issue);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  create: async (req, res, data) => {
    try {
      const db = getDb();
      const id = String(data.id || Date.now());
      const now = new Date().toISOString();
      
      const sql = `INSERT INTO issues (id, title, description, status, priority, labels, 
                   assignee, reporter, projectId, sprintId, storyPoints, parentIssueId, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      db.run(sql, [
        id,
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
        now,
        now,
      ]);

      saveDb();
      const issue = queryOne('SELECT * FROM issues WHERE id = ?', [id]);
      sendJson(res, 201, issue);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  update: async (req, res, id, data) => {
    try {
      const db = getDb();
      const fields = [];
      const values = [];

      const allowedFields = ['title', 'description', 'status', 'priority', 'labels', 
                            'assignee', 'reporter', 'projectId', 'sprintId', 
                            'storyPoints', 'parentIssueId'];
      
      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(field === 'labels' ? JSON.stringify(data[field]) : data[field]);
        }
      }

      if (fields.length === 0) {
        return sendJson(res, 400, { error: 'No fields to update' });
      }

      fields.push('updatedAt = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const sql = `UPDATE issues SET ${fields.join(', ')} WHERE id = ?`;
      db.run(sql, values);
      saveDb();

      const issue = queryOne('SELECT * FROM issues WHERE id = ?', [id]);
      if (!issue) {
        return sendJson(res, 404, { error: 'Issue not found' });
      }
      sendJson(res, 200, issue);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  remove: async (req, res, id) => {
    try {
      const db = getDb();
      const issue = queryOne('SELECT * FROM issues WHERE id = ?', [id]);
      if (!issue) {
        return sendJson(res, 404, { error: 'Issue not found' });
      }

      // Move to trash before deleting
      const trashId = `trash_${Date.now()}`;
      db.run(
        'INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)',
        [trashId, 'issue', JSON.stringify(issue), new Date().toISOString()]
      );

      // Delete issue
      db.run('DELETE FROM issues WHERE id = ?', [id]);
      saveDb();

      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },
};

export default router;