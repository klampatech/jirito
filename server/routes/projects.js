// ===== Projects CRUD Routes =====
// GET    /api/projects          — list all projects
// GET    /api/projects/current  — get current project
// PUT    /api/projects/current  — set current project
// POST   /api/projects          — create project
// DELETE /api/projects/:id      — delete project

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
    const projects = queryAll('SELECT * FROM projects ORDER BY createdAt ASC');
    sendJson(res, 200, projects);
  } catch (error) {
    console.error('getAll projects error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function getCurrent(req, res) {
  try {
    const db = getDb();
    const result = db.exec("SELECT value FROM metadata WHERE key = 'currentProject'");
    const currentProject = result.length > 0 ? result[0].values[0][0] : 'default';

    const projectResult = db.exec('SELECT * FROM projects WHERE id = ?', [currentProject]);
    if (projectResult.length === 0 || projectResult[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Project not found' });
    }
    const cols = projectResult[0].columns;
    const row = projectResult[0].values[0];
    const project = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        project[col] = parseJsonColumn(value);
      } else {
        project[col] = value;
      }
    });
    sendJson(res, 200, project);
  } catch (error) {
    console.error('getCurrent project error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function setCurrent(req, res, body) {
  try {
    const db = getDb();
    const currentProject = body.currentProject;

    // Verify project exists
    const check = db.exec('SELECT id FROM projects WHERE id = ?', [currentProject]);
    if (check.length === 0 || check[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Project not found' });
    }

    db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)", [currentProject]);
    await saveDb();

    sendJson(res, 200, { success: true, currentProject });
  } catch (error) {
    console.error('setCurrent project error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function create(req, res, body) {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = body.id || `proj_${Date.now()}`;

    db.run(
      'INSERT INTO projects (id, name, key, icon, color, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        body.name || '',
        body.key || id,
        body.icon || '\uD83D\uDE80',
        body.color || '#0052CC',
        body.description || '',
        now,
        now,
      ]
    );

    await saveDb();

    sendJson(res, 201, {
      id,
      name: body.name || '',
      key: body.key || id,
      icon: body.icon || '\uD83D\uDE80',
      color: body.color || '#0052CC',
      description: body.description || '',
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('create project error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function remove(req, res, id) {
  try {
    const db = getDb();

    // Check how many projects exist
    const countResult = db.exec('SELECT COUNT(*) as count FROM projects');
    const count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    if (count <= 1) {
      return sendJson(res, 400, { error: 'You must have at least one project' });
    }

    // Get project name for response
    const projectResult = db.exec('SELECT name FROM projects WHERE id = ?', [id]);
    const projectName = projectResult.length > 0 ? projectResult[0].values[0][0] : id;

    // Delete project (cascade will handle sprints)
    db.run('DELETE FROM projects WHERE id = ?', [id]);

    // Update current project if it was the current one
    const currentResult = db.exec("SELECT value FROM metadata WHERE key = 'currentProject'");
    const currentProject = currentResult.length > 0 ? currentResult[0].values[0][0] : 'default';
    if (currentProject === id) {
      // Find another project to use as current
      const otherResult = db.exec('SELECT id FROM projects LIMIT 1');
      if (otherResult.length > 0 && otherResult[0].values.length > 0) {
        const newCurrent = otherResult[0].values[0][0];
        db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)", [newCurrent]);
      }
    }

    await saveDb();

    sendJson(res, 200, { success: true, message: `Project "${projectName}" deleted` });
  } catch (error) {
    console.error('remove project error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { getAll, getCurrent, setCurrent, create, remove };
