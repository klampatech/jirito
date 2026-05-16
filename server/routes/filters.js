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
      if (col === 'query' && typeof row[i] === 'string') {
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
      const filters = queryAll('SELECT * FROM filters ORDER BY sortOrder ASC');
      sendJson(res, 200, filters);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  create: async (req, res, data) => {
    try {
      const db = getDb();
      const id = data.id || `filter_${Date.now()}`;
      const now = new Date().toISOString();

      // Get max sortOrder
      const maxOrder = db.exec('SELECT MAX(sortOrder) as max FROM filters');
      const sortOrder = (maxOrder[0]?.values[0]?.[0] ?? -1) + 1;

      db.run(
        'INSERT INTO filters (id, name, query, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [
          id,
          data.name || 'New Filter',
          typeof data.query === 'string' ? data.query : JSON.stringify(data.query || {}),
          data.sortOrder ?? sortOrder,
          now,
          now,
        ]
      );

      saveDb();
      const filter = queryAll('SELECT * FROM filters WHERE id = ?', [id]);
      sendJson(res, 201, filter[0]);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  update: async (req, res, id, data) => {
    try {
      const db = getDb();
      const fields = [];
      const values = [];

      const allowedFields = ['name', 'query', 'sortOrder'];
      
      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = ?`);
          if (field === 'query') {
            values.push(typeof data[field] === 'string' ? data[field] : JSON.stringify(data[field]));
          } else {
            values.push(data[field]);
          }
        }
      }

      if (fields.length === 0) {
        return sendJson(res, 400, { error: 'No fields to update' });
      }

      fields.push('updatedAt = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const sql = `UPDATE filters SET ${fields.join(', ')} WHERE id = ?`;
      db.run(sql, values);
      saveDb();

      const filter = queryAll('SELECT * FROM filters WHERE id = ?', [id]);
      if (!filter[0]) {
        return sendJson(res, 404, { error: 'Filter not found' });
      }
      sendJson(res, 200, filter[0]);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },

  remove: async (req, res, id) => {
    try {
      const db = getDb();
      const result = db.exec('SELECT COUNT(*) as count FROM filters');
      if (result[0].values[0][0] <= 1) {
        return sendJson(res, 400, { error: 'Cannot delete the last filter' });
      }

      db.run('DELETE FROM filters WHERE id = ?', [id]);
      saveDb();
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  },
};

export default router;