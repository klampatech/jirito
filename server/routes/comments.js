// ===== Comments CRUD Routes =====
// GET    /api/comments              — list all comments (optionally filtered by issueId)
// POST   /api/comments              — create comment
// PUT    /api/comments/:id          — update comment
// DELETE /api/comments/:id          — delete comment

import { getDb, saveDb } from '../db/index.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
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
    const url = new URL(req.url, `http://${req.headers.host}`);
    const issueId = url.searchParams.get('issueId');
    let sql = 'SELECT * FROM comments';
    const params = [];
    if (issueId) {
      sql += ' WHERE issueId = ?';
      params.push(issueId);
    }
    sql += ' ORDER BY createdAt ASC';
    const comments = queryAll(sql, params);
    sendJson(res, 200, comments);
  } catch (error) {
    console.error('getAll comments error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function create(req, res, body) {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    db.run(
      'INSERT INTO comments (id, issueId, content, author, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [
        id,
        body.issueId || '',
        body.content || '',
        body.author || '',
        now,
        now,
      ]
    );

    await saveDb();

    sendJson(res, 201, {
      id,
      issueId: body.issueId || '',
      content: body.content || '',
      author: body.author || '',
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('create comment error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function update(req, res, id, body) {
  try {
    const db = getDb();

    // Check comment exists
    const check = db.exec('SELECT id FROM comments WHERE id = ?', [id]);
    if (check.length === 0 || check[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Comment not found' });
    }

    const now = new Date().toISOString();
    const updates = [];
    const params = [];

    if (body.content !== undefined) {
      updates.push('content = ?');
      params.push(body.content);
    }
    if (body.author !== undefined) {
      updates.push('author = ?');
      params.push(body.author);
    }
    updates.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    db.run(`UPDATE comments SET ${updates.join(', ')} WHERE id = ?`, params);

    await saveDb();

    // Return updated comment
    const result = db.exec('SELECT * FROM comments WHERE id = ?', [id]);
    if (result.length === 0) {
      return sendJson(res, 404, { error: 'Comment not found' });
    }
    const cols = result[0].columns;
    const row = result[0].values[0];
    const comment = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        comment[col] = parseJsonColumn(value);
      } else {
        comment[col] = value;
      }
    });
    sendJson(res, 200, comment);
  } catch (error) {
    console.error('update comment error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function remove(req, res, id) {
  try {
    const db = getDb();
    db.run('DELETE FROM comments WHERE id = ?', [id]);
    await saveDb();
    sendJson(res, 200, { success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('remove comment error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { getAll, create, update, remove };
