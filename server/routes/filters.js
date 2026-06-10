// ===== Saved Filters CRUD Routes =====
// GET    /api/filters           — list all filters
// POST   /api/filters           — create filter
// PUT    /api/filters/:id       — update filter
// DELETE /api/filters/:id       — delete filter

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
    const filters = queryAll('SELECT * FROM filters ORDER BY sortOrder ASC');
    sendJson(res, 200, filters);
  } catch (error) {
    console.error('getAll filters error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function create(req, res, body) {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = body.id || `filter_${Date.now()}`;

    db.run(
      'INSERT INTO filters (id, name, query, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [
        id,
        body.name || '',
        typeof body.query === 'string' ? body.query : JSON.stringify(body.query || {}),
        body.sortOrder || 0,
        now,
        now,
      ]
    );

    await saveDb();

    sendJson(res, 201, {
      id,
      name: body.name || '',
      query: body.query || {},
      sortOrder: body.sortOrder || 0,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('create filter error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function update(req, res, id, body) {
  try {
    const db = getDb();

    // Check filter exists
    const check = db.exec('SELECT id FROM filters WHERE id = ?', [id]);
    if (check.length === 0 || check[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Filter not found' });
    }

    const now = new Date().toISOString();

    // Build dynamic UPDATE
    const updates = [];
    const params = [];
    if (body.name !== undefined) {
      updates.push('name = ?');
      params.push(body.name);
    }
    if (body.query !== undefined) {
      updates.push('query = ?');
      params.push(typeof body.query === 'string' ? body.query : JSON.stringify(body.query));
    }
    if (body.sortOrder !== undefined) {
      updates.push('sortOrder = ?');
      params.push(body.sortOrder);
    }
    updates.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    db.run(`UPDATE filters SET ${updates.join(', ')} WHERE id = ?`, params);

    await saveDb();

    // Return updated filter
    const result = db.exec('SELECT * FROM filters WHERE id = ?', [id]);
    if (result.length === 0) {
      return sendJson(res, 404, { error: 'Filter not found' });
    }
    const cols = result[0].columns;
    const row = result[0].values[0];
    const filter = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        filter[col] = parseJsonColumn(value);
      } else {
        filter[col] = value;
      }
    });
    sendJson(res, 200, filter);
  } catch (error) {
    console.error('update filter error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function remove(req, res, id) {
  try {
    const db = getDb();

    // Get filter name for response
    const filterResult = db.exec('SELECT name FROM filters WHERE id = ?', [id]);
    const filterName = filterResult.length > 0 ? filterResult[0].values[0][0] : id;

    db.run('DELETE FROM filters WHERE id = ?', [id]);
    await saveDb();

    sendJson(res, 200, { success: true, message: `Filter "${filterName}" deleted` });
  } catch (error) {
    console.error('remove filter error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { getAll, create, update, remove };
