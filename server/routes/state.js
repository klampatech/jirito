// ===== State Sync Endpoint =====
// GET  /api/state  — returns full application state
// PUT  /api/state  — replaces all state (import/sync)

import { getDb, saveDb } from '../db/index.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Parse a JSON column from the database, returning the parsed object
 * or the raw value if parsing fails.
 */
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

/**
 * Query all rows from a table, auto-parsing JSON columns.
 */
function queryAll(sql, params = []) {
  const db = getDb();
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return [];
  const cols = result[0].columns;
  // Determine which columns are JSON by examining the table schema
  const jsonCols = getJsonColumns(cols);
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, i) => {
      const value = row[i];
      if (jsonCols.has(col) && typeof value === 'string') {
        obj[col] = parseJsonColumn(value);
      } else {
        obj[col] = value;
      }
    });
    return obj;
  });
}

// Cache of table schemas to identify JSON columns
let schemaCache = new Map();

function getJsonColumns(columns) {
  const db = getDb();
  const result = db.exec("SELECT sql FROM sqlite_master WHERE type='table'");
  if (result.length === 0) return new Set();
  const jsonCols = new Set();
  result[0].values.forEach(([sql]) => {
    // Extract column definitions from CREATE TABLE
    const match = sql.match(/\((.*)\)/s);
    if (!match) return;
    const colDefs = match[1].split(',');
    colDefs.forEach(def => {
      const trimmed = def.trim();
      // Match column name and type: "labels TEXT DEFAULT '[]'"
      const colMatch = trimmed.match(/^(\w+)\s+([A-Z]+)/);
      if (colMatch) {
        const colName = colMatch[1].toLowerCase();
        const colType = colMatch[2].toUpperCase();
        // Only check JSON columns that are TEXT type
        if (colType === 'TEXT' && ['labels', 'query', 'details', 'data', 'description', 'goal'].includes(colName)) {
          jsonCols.add(colName);
        }
      }
    });
  });
  return jsonCols;
}

// Get all data for initial frontend load
export async function getState(req, res) {
  try {
    const db = getDb();

    // Get projects
    const projects = queryAll('SELECT * FROM projects ORDER BY createdAt ASC');

    // Get current project
    const currentProjectResult = db.exec("SELECT value FROM metadata WHERE key = 'currentProject'");
    const currentProject = currentProjectResult.length > 0 ? currentProjectResult[0].values[0][0] : 'default';

    // Get issues
    const issues = queryAll('SELECT * FROM issues ORDER BY createdAt DESC');

    // Get sprints as an object keyed by id (matching frontend's expected format)
    const sprintsArr = queryAll('SELECT * FROM sprints ORDER BY createdAt ASC');
    const sprints = {};
    for (const s of sprintsArr) {
      sprints[s.id] = s;
    }

    // Get activity log with parsed dates
    const activity = queryAll('SELECT * FROM activity ORDER BY time DESC LIMIT 100');
    const activityLog = activity.map(a => ({
      ...a,
      time: a.time,
    }));

    // Get saved filters
    const savedFilters = queryAll('SELECT * FROM filters ORDER BY sortOrder ASC');

    // Get trash
    const trash = queryAll('SELECT * FROM trash ORDER BY date DESC');
    const trashItems = trash.map(t => ({
      ...t,
      date: t.date,
    }));

    // Get issue counter
    const counterResult = db.exec("SELECT value FROM metadata WHERE key = 'issueCounter'");
    const issueCounter = counterResult.length > 0 ? parseInt(counterResult[0].values[0][0]) || 1 : 1;

    // Build projects object like frontend expects
    const projectsObj = {};
    for (const proj of projects) {
      projectsObj[proj.id] = {
        name: proj.name,
        key: proj.key,
        icon: proj.icon || '\uD83D\uDE80',
        color: proj.color || '#0052CC',
        description: proj.description || '',
        issues: issues.filter(i => i.projectId === proj.id).map(i => i.id),
      };
    }

    // Get comments
    const comments = queryAll('SELECT * FROM comments ORDER BY createdAt ASC');

    // Get custom columns
    const columns = queryAll('SELECT * FROM columns ORDER BY sortOrder ASC');

    sendJson(res, 200, {
      issues,
      comments,
      projects: projectsObj,
      currentProject,
      savedFilters,
      activityLog,
      issueCounter,
      trash: trashItems,
      sprints,
      columns,
    });
  } catch (error) {
    console.error('getState error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

// Replace all state (used for import/sync)
export async function setState(req, res, data) {
  try {
    const db = getDb();

    // Clear existing data
    db.run('DELETE FROM activity');
    db.run('DELETE FROM columns');
    db.run('DELETE FROM comments');
    db.run('DELETE FROM filters');
    db.run('DELETE FROM issues');
    db.run('DELETE FROM projects');
    db.run('DELETE FROM sprints');
    db.run('DELETE FROM trash');

    // Import projects
    if (data.projects) {
      const projectIds = Object.keys(data.projects);
      for (const projId of projectIds) {
        const proj = data.projects[projId];
        db.run(
          'INSERT INTO projects (id, name, key, icon, color, description) VALUES (?, ?, ?, ?, ?, ?)',
          [projId, proj.name, proj.key || projId, proj.icon || '\uD83D\uDE80', proj.color || '#0052CC', proj.description || '']
        );
      }
    }

    // Import issues
    if (data.issues) {
      for (const issue of data.issues) {
        db.run(
          `INSERT INTO issues (id, title, description, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, parentIssueId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(issue.id),
            issue.title || '',
            issue.description || '',
            issue.status || 'backlog',
            issue.priority || 'medium',
            JSON.stringify(issue.labels || []),
            issue.assignee || '',
            issue.reporter || '',
            issue.projectId || 'default',
            issue.sprintId || null,
            issue.storyPoints || 0,
            issue.parentIssueId || null,
            issue.createdAt || new Date().toISOString(),
            issue.updatedAt || new Date().toISOString(),
          ]
        );
      }
    }

    // Import sprints (data.sprints is an object keyed by sprint id)
    if (data.sprints && typeof data.sprints === 'object') {
      for (const [sprintId, sprint] of Object.entries(data.sprints)) {
        db.run(
          'INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [sprintId, sprint.projectId || 'default', sprint.name || '', sprint.status || 'active', sprint.startDate || null, sprint.endDate || null, sprint.goal || '']
        );
      }
    }

    // Import activity log
    if (data.activityLog) {
      for (const activity of data.activityLog) {
        db.run(
          'INSERT INTO activity (id, issueId, action, details, time) VALUES (?, ?, ?, ?, ?)',
          [
            `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            activity.issueId || null,
            activity.action || '',
            typeof activity.details === 'string' ? activity.details : JSON.stringify(activity.details || {}),
            activity.time || new Date().toISOString(),
          ]
        );
      }
    }

    // Import saved filters
    if (data.savedFilters) {
      for (const filter of data.savedFilters) {
        db.run(
          'INSERT INTO filters (id, name, query, sortOrder) VALUES (?, ?, ?, ?)',
          [filter.id, filter.name, typeof filter.query === 'string' ? filter.query : JSON.stringify(filter.query || {}), filter.sortOrder || 0]
        );
      }
    }

    // Import trash
    if (data.trash) {
      for (const t of data.trash) {
        db.run(
          'INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)',
          [t.id || `trash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, t.type || 'issue', JSON.stringify(t.data || {}), t.date || new Date().toISOString()]
        );
      }
    }

    // Import comments
    if (data.comments) {
      for (const c of data.comments) {
        db.run(
          'INSERT INTO comments (id, issueId, content, author, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [c.id, c.issueId, c.content || '', c.author || '', c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()]
        );
      }
    }

    // Import custom columns
    if (data.columns) {
      for (const col of data.columns) {
        db.run(
          'INSERT INTO columns (id, name, query, projectId, sortOrder) VALUES (?, ?, ?, ?, ?)',
          [col.id, col.name, typeof col.query === 'string' ? col.query : JSON.stringify(col.query || {}), col.projectId || null, col.sortOrder || 0]
        );
      }
    }

    // Set current project
    if (data.currentProject) {
      db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)", [data.currentProject]);
    }

    // Set issue counter
    if (data.issueCounter) {
      db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('issueCounter', ?)", [String(data.issueCounter)]);
    }

    await saveDb();
    sendJson(res, 200, { success: true, message: 'State imported successfully' });
  } catch (error) {
    console.error('setState error:', error);
    sendJson(res, 500, { error: error.message });
  }
}
