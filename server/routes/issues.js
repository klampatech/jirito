// ===== Issues CRUD Routes =====
// GET    /api/issues          — list all issues
// GET    /api/issues/:id      — get single issue
// POST   /api/issues          — create issue
// PUT    /api/issues/:id      — update issue
// DELETE /api/issues/:id      — soft-delete (move to trash)

import { getDb, saveDb } from '../db/index.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function coerceIssueId(issue) {
  if (issue && typeof issue.id === 'string' && /^\d+$/.test(issue.id)) {
    return { ...issue, id: Number(issue.id) };
  }
  return issue;
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
      // Auto-parse JSON columns
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        obj[col] = parseJsonColumn(value);
      } else {
        obj[col] = value;
      }
    });
    return obj;
  });
}

export async function getAll(req, res, url) {
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
    sendJson(res, 200, issues.map(coerceIssueId));
  } catch (error) {
    console.error('getAll issues error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function getById(req, res, id) {
  try {
    const db = getDb();
    const result = db.exec('SELECT * FROM issues WHERE id = ?', [String(id)]);
    if (result.length === 0 || result[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Issue not found' });
    }
    const cols = result[0].columns;
    const row = result[0].values[0];
    const issue = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        issue[col] = parseJsonColumn(value);
      } else {
        issue[col] = value;
      }
    });
    sendJson(res, 200, coerceIssueId(issue));
  } catch (error) {
    console.error('getById issue error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function create(req, res, body) {
  try {
    const db = getDb();

    // Generate ID from issueCounter metadata
    const counterResult = db.exec("SELECT value FROM metadata WHERE key = 'issueCounter'");
    let issueCounter = counterResult.length > 0 ? parseInt(counterResult[0].values[0][0]) || 1 : 1;
    issueCounter += 1;
    db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('issueCounter', ?)", [String(issueCounter)]);

    const id = String(issueCounter);
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO issues (id, title, description, type, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, rank, parentIssueId, dueDate, customColumnId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.title || '',
        body.description || '',
        body.type || 'task',
        body.status || 'backlog',
        body.priority || 'medium',
        JSON.stringify(body.labels || []),
        body.assignee || '',
        body.reporter || '',
        body.projectId || 'default',
        body.sprintId || null,
        body.storyPoints || 0,
        body.rank ?? 0,
        body.parentIssueId || null,
        body.dueDate || '',
        body.customColumnId || null,
        now,
        now,
      ]
    );

    await saveDb();

    sendJson(res, 201, coerceIssueId({
      id: Number(id),
      title: body.title || '',
      description: body.description || '',
      status: body.status || 'backlog',
      priority: body.priority || 'medium',
      labels: body.labels || [],
      assignee: body.assignee || '',
      reporter: body.reporter || '',
      projectId: body.projectId || 'default',
      sprintId: body.sprintId || null,
      storyPoints: body.storyPoints || 0,
      parentIssueId: body.parentIssueId || null,
      dueDate: body.dueDate || null,
      createdAt: now,
      updatedAt: now,
    }));
  } catch (error) {
    console.error('create issue error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function update(req, res, id, body) {
  try {
    const db = getDb();

    // Check issue exists
    const check = db.exec('SELECT id FROM issues WHERE id = ?', [String(id)]);
    if (check.length === 0 || check[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Issue not found' });
    }

    const now = new Date().toISOString();

    // Build dynamic UPDATE
    const updates = [];
    const params = [];
    const fields = ['title', 'description', 'type', 'status', 'priority', 'labels', 'assignee', 'reporter', 'projectId', 'sprintId', 'storyPoints', 'rank', 'parentIssueId', 'dueDate', 'customColumnId'];
    for (const field of fields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (['labels'].includes(field)) {
          params.push(JSON.stringify(body[field]));
        } else {
          params.push(body[field]);
        }
      }
    }
    updates.push('updatedAt = ?');
    params.push(now);
    params.push(String(id));

    db.run(`UPDATE issues SET ${updates.join(', ')} WHERE id = ?`, params);

    await saveDb();

    // Return updated issue
    const result = db.exec('SELECT * FROM issues WHERE id = ?', [String(id)]);
    if (result.length === 0) {
      return sendJson(res, 404, { error: 'Issue not found' });
    }
    const cols = result[0].columns;
    const row = result[0].values[0];
    const issue = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        issue[col] = parseJsonColumn(value);
      } else {
        issue[col] = value;
      }
    });
    sendJson(res, 200, coerceIssueId(issue));
  } catch (error) {
    console.error('update issue error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export async function remove(req, res, id) {
  try {
    const db = getDb();

    // Get the issue before deleting
    const issueResult = db.exec('SELECT * FROM issues WHERE id = ?', [String(id)]);
    if (issueResult.length === 0 || issueResult[0].values.length === 0) {
      return sendJson(res, 404, { error: 'Issue not found' });
    }

    const cols = issueResult[0].columns;
    const row = issueResult[0].values[0];
    const issue = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (['labels', 'query', 'details', 'data', 'description', 'goal'].includes(col.toLowerCase()) && typeof value === 'string') {
        issue[col] = parseJsonColumn(value);
      } else {
        issue[col] = value;
      }
    });

    // Add to trash
    const trashId = `trash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    db.run(
      'INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)',
      [trashId, 'issue', JSON.stringify(issue), new Date().toISOString()]
    );

    // Delete from issues
    db.run('DELETE FROM issues WHERE id = ?', [String(id)]);

    await saveDb();

    sendJson(res, 200, { success: true, message: 'Issue moved to trash' });
  } catch (error) {
    console.error('remove issue error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { getAll, getById, create, update, remove };
