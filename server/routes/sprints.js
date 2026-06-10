// ===== Sprints CRUD Routes =====
// GET    /api/projects/:id/sprints  — get sprints for a project
// POST   /api/sprints              — create sprint
// PUT    /api/sprints/:id          — update sprint
// DELETE /api/sprints/:id          — delete sprint

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

export async function getByProject(req, res, projectId) {
  try {
    const sprints = queryAll('SELECT * FROM sprints WHERE projectId = ? ORDER BY createdAt ASC', [projectId]);
    sendJson(res, 200, sprints);
  } catch (error) {
    console.error('getByProject sprints error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function create(req, res, body) {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = body.id || `sprint_${Date.now()}`;

    db.run(
      'INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        body.projectId || 'default',
        body.name || '',
        body.status || 'active',
        body.startDate || null,
        body.endDate || null,
        body.goal || '',
        now,
        now,
      ]
    );

    await saveDb();

    sendJson(res, 201, {
      id,
      projectId: body.projectId || 'default',
      name: body.name || '',
      status: body.status || 'active',
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      goal: body.goal || '',
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('create sprint error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function update(req, res, id, body) {
  try {
    const db = getDb();

    // Check sprint exists
    const check = db.exec('SELECT id FROM sprints WHERE id = ?', [id]);
    if (check.length === 0 || check[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Sprint not found' });
    }

    const now = new Date().toISOString();

    // Build dynamic UPDATE
    const updates = [];
    const params = [];
    const fields = ['name', 'status', 'startDate', 'endDate', 'goal'];
    for (const field of fields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    }
    updates.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    db.run(`UPDATE sprints SET ${updates.join(', ')} WHERE id = ?`, params);

    await saveDb();

    // Return updated sprint
    const result = db.exec('SELECT * FROM sprints WHERE id = ?', [id]);
    if (result.length === 0) {
      return sendJson(res, 404, { error: 'Sprint not found' });
    }
    const cols = result[0].columns;
    const row = result[0].values[0];
    const sprint = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        sprint[col] = parseJsonColumn(value);
      } else {
        sprint[col] = value;
      }
    });
    sendJson(res, 200, sprint);
  } catch (error) {
    console.error('update sprint error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function remove(req, res, id) {
  try {
    const db = getDb();

    // Get sprint name for response
    const sprintResult = db.exec('SELECT name FROM sprints WHERE id = ?', [id]);
    const sprintName = sprintResult.length > 0 ? sprintResult[0].values[0][0] : id;

    // Delete sprint
    db.run('DELETE FROM sprints WHERE id = ?', [id]);

    await saveDb();

    sendJson(res, 200, { success: true, message: `Sprint "${sprintName}" deleted` });
  } catch (error) {
    console.error('remove sprint error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { getByProject, create, update, remove };
