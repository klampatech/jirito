// ===== Import/Export Routes =====
// POST /api/import  — import exported JSON data
// GET  /api/export  — export all data as JSON

import { getDb, saveDb } from '../db/index.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Import exported JSON data into the database.
 * Replaces all current data with the imported data.
 */
export async function importData(req, res, body) {
  try {
    const db = getDb();

    // Validate required fields
    if (!body.issues || !Array.isArray(body.issues)) {
      return sendJson(res, 400, { error: 'Invalid format: missing issues array' });
    }
    if (typeof body.projects !== 'object' || body.projects === null || Array.isArray(body.projects)) {
      return sendJson(res, 400, { error: 'Invalid format: projects must be an object' });
    }

    // Validate each project
    for (const [key, proj] of Object.entries(body.projects)) {
      if (typeof proj !== 'object' || proj === null) {
        return sendJson(res, 400, { error: `Invalid project "${key}"` });
      }
      if (typeof proj.name !== 'string' || proj.name.trim() === '') {
        return sendJson(res, 400, { error: `Project "${key}" must have a non-empty name` });
      }
      if (typeof proj.key !== 'string' || proj.key.trim() === '') {
        return sendJson(res, 400, { error: `Project "${key}" must have a non-empty key` });
      }
    }

    // Validate each issue
    for (const issue of body.issues) {
      if (issue.id == null || issue.title == null || issue.status == null) {
        return sendJson(res, 400, { error: `Issue ${issue.id}: must have id, title, and status fields` });
      }
      const validStatuses = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
      if (!validStatuses.includes(issue.status)) {
        return sendJson(res, 400, { error: `Issue ${issue.id}: invalid status "${issue.status}"` });
      }
    }

    // Disable FK checks for the entire import (we validate data above)
    db.run('PRAGMA foreign_keys=OFF');

    // Clear existing data
    db.run('DELETE FROM issues');
    db.run('DELETE FROM comments');
    db.run('DELETE FROM sprints');
    db.run('DELETE FROM filters');
    db.run('DELETE FROM activity');
    db.run('DELETE FROM trash');
    db.run('DELETE FROM columns');
    db.run('DELETE FROM metadata');
    db.run('DELETE FROM projects');

    // Wrap all inserts in a transaction for atomicity
    db.run('BEGIN TRANSACTION');

    // Insert projects
    const now = new Date().toISOString();
    for (const [key, proj] of Object.entries(body.projects)) {
      db.run(
        'INSERT INTO projects (id, name, key, icon, color, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [key, proj.name, proj.key, proj.icon || '🚀', proj.color || '#0052CC', proj.description || '', proj.createdAt || now, now]
      );
    }

    // Insert issues
    for (const issue of body.issues) {
      const labels = typeof issue.labels === 'string' ? issue.labels : JSON.stringify(issue.labels || []);
      const createdAt = issue.createdAt || now;
      const updatedAt = issue.updatedAt || now;
      db.run(
        'INSERT INTO issues (id, title, description, status, priority, labels, assignee, reporter, projectId, sprintId, storyPoints, parentIssueId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          String(issue.id),
          issue.title || '',
          issue.description || '',
          issue.status || 'backlog',
          issue.priority || 'medium',
          labels,
          issue.assignee || '',
          issue.reporter || '',
          issue.projectId || 'default',
          issue.sprintId || null,
          issue.storyPoints || 0,
          issue.parentIssueId || null,
          createdAt,
          updatedAt,
        ]
      );
    }

    // Insert comments
    if (body.comments) {
      for (const issueId of Object.keys(body.comments)) {
        const comments = body.comments[issueId];
        if (Array.isArray(comments)) {
          for (const comment of comments) {
            const commentCreated = comment.createdAt || now;
            const commentUpdated = comment.updatedAt || now;
            db.run(
              'INSERT INTO comments (id, issueId, content, author, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
              [comment.id, issueId, comment.content || '', comment.author || '', commentCreated, commentUpdated]
            );
          }
        }
      }
    }

    // Insert sprints
    if (body.sprints) {
      for (const sprint of body.sprints) {
        const sprintCreated = sprint.createdAt || now;
        const sprintUpdated = sprint.updatedAt || now;
        db.run(
          'INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [sprint.id, sprint.projectId || 'default', sprint.name || '', sprint.status || 'active', sprint.startDate || null, sprint.endDate || null, sprint.goal || '', sprintCreated, sprintUpdated]
        );
      }
    }

    // Insert filters
    if (body.savedFilters) {
      for (const filter of body.savedFilters) {
        const filterQuery = typeof filter.query === 'string' ? filter.query : JSON.stringify(filter.query || {});
        const filterCreated = filter.createdAt || now;
        const filterUpdated = filter.updatedAt || now;
        db.run(
          'INSERT INTO filters (id, name, query, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [filter.id, filter.name || '', filterQuery, filter.sortOrder || 0, filterCreated, filterUpdated]
        );
      }
    }

    // Insert activity log
    if (body.activityLog) {
      for (const entry of body.activityLog) {
        const activityDetails = typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details || {});
        const activityTime = entry.time || now;
        db.run(
          'INSERT INTO activity (id, issueId, action, details, time) VALUES (?, ?, ?, ?, ?)',
          [entry.id, entry.issueId || null, entry.action || '', activityDetails, activityTime]
        );
      }
    }

    // Insert trash
    if (body.trash) {
      for (const item of body.trash) {
        const trashData = typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {});
        const trashDate = item.date || now;
        db.run(
          'INSERT INTO trash (id, type, data, date) VALUES (?, ?, ?, ?)',
          [item.id, item.type || 'issue', trashData, trashDate]
        );
      }
    }

    // Set metadata
    const issueCounter = body.issueCounter || 1;
    db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('issueCounter', ?)", [String(issueCounter)]);
    db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)", [body.currentProject || 'default']);

    // Commit transaction
    db.run('COMMIT');

    await saveDb();

    sendJson(res, 200, {
      success: true,
      message: 'Import successful',
      imported: {
        issues: body.issues.length,
        projects: Object.keys(body.projects).length,
        comments: Object.values(body.comments || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
        sprints: (body.sprints || []).length,
        filters: (body.savedFilters || []).length,
        activity: (body.activityLog || []).length,
        trash: (body.trash || []).length,
      },
    });
  } catch (error) {
    console.error('import error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

/**
 * Export all data in the format matching the frontend's exportData().
 */
export function exportData(req, res) {
  try {
    const db = getDb();

    // Get all issues
    const issuesResult = db.exec('SELECT * FROM issues ORDER BY id ASC');
    const issues = issuesResult.length > 0 ? issuesResult[0].values.map((row) => {
      const cols = issuesResult[0].columns;
      const obj = {};
      cols.forEach((col, i) => {
        const value = row[i];
        if (['labels'].includes(col) && typeof value === 'string') {
          try { obj[col] = JSON.parse(value); } catch { obj[col] = value; }
        } else {
          obj[col] = value;
        }
      });
      return obj;
    }) : [];

    // Get all projects
    const projectsResult = db.exec('SELECT * FROM projects');
    const projects = {};
    if (projectsResult.length > 0) {
      const cols = projectsResult[0].columns;
      projectsResult[0].values.forEach((row) => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        const key = obj.id;
        delete obj.id;
        projects[key] = obj;
      });
    }

    // Get current project
    const currentResult = db.exec("SELECT value FROM metadata WHERE key = 'currentProject'");
    const currentProject = currentResult.length > 0 ? currentResult[0].values[0][0] : 'default';

    // Get issue counter
    const counterResult = db.exec("SELECT value FROM metadata WHERE key = 'issueCounter'");
    const issueCounter = counterResult.length > 0 ? parseInt(counterResult[0].values[0][0]) : 1;

    // Get comments grouped by issueId
    const commentsResult = db.exec('SELECT * FROM comments');
    const comments = {};
    if (commentsResult.length > 0) {
      const cols = commentsResult[0].columns;
      commentsResult[0].values.forEach((row) => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        const issueId = obj.issueId;
        delete obj.issueId;
        comments[issueId] = comments[issueId] || [];
        comments[issueId].push(obj);
      });
    }

    // Get sprints
    const sprintsResult = db.exec('SELECT * FROM sprints ORDER BY createdAt ASC');
    const sprints = sprintsResult.length > 0 ? sprintsResult[0].values.map((row) => {
      const cols = sprintsResult[0].columns;
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    }) : [];

    // Get filters
    const filtersResult = db.exec('SELECT * FROM filters ORDER BY sortOrder ASC');
    const savedFilters = filtersResult.length > 0 ? filtersResult[0].values.map((row) => {
      const cols = filtersResult[0].columns;
      const obj = {};
      cols.forEach((col, i) => {
        const value = row[i];
        if (['query'].includes(col) && typeof value === 'string') {
          try { obj[col] = JSON.parse(value); } catch { obj[col] = value; }
        } else {
          obj[col] = value;
        }
      });
      return obj;
    }) : [];

    // Get activity log
    const activityResult = db.exec('SELECT * FROM activity ORDER BY time DESC');
    const activityLog = activityResult.length > 0 ? activityResult[0].values.map((row) => {
      const cols = activityResult[0].columns;
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    }) : [];

    // Get trash
    const trashResult = db.exec('SELECT * FROM trash ORDER BY date DESC');
    const trash = trashResult.length > 0 ? trashResult[0].values.map((row) => {
      const cols = trashResult[0].columns;
      const obj = {};
      cols.forEach((col, i) => {
        const value = row[i];
        if (['data'].includes(col) && typeof value === 'string') {
          try { obj[col] = JSON.parse(value); } catch { obj[col] = value; }
        } else {
          obj[col] = value;
        }
      });
      return obj;
    }) : [];

    const exportData = {
      issues,
      comments,
      projects,
      currentProject,
      savedFilters,
      activityLog,
      issueCounter,
      trash,
      sprints,
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `attachment; filename="jirito-export-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('export error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

export default { importData, exportData };
