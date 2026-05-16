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
      const value = row[i];
      // Parse JSON fields
      if ((col === 'labels' || col === 'query' || col === 'details' || col === 'data') && typeof value === 'string') {
        try {
          obj[col] = JSON.parse(value);
        } catch {
          obj[col] = value;
        }
      } else {
        obj[col] = value;
      }
    });
    return obj;
  });
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

    // Get sprints
    const sprints = queryAll('SELECT * FROM sprints ORDER BY createdAt ASC');

    // Get activity log with parsed dates
    const activity = queryAll('SELECT * FROM activity ORDER BY time DESC LIMIT 100');
    const activityLog = activity.map(a => ({
      ...a,
      time: a.time
    }));

    // Get saved filters
    const savedFilters = queryAll('SELECT * FROM filters ORDER BY sortOrder ASC');

    // Get trash
    const trash = queryAll('SELECT * FROM trash ORDER BY date DESC');
    const trashItems = trash.map(t => ({
      ...t,
      date: t.date
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
        icon: proj.icon || '🚀',
        color: proj.color || '#0052CC',
        description: proj.description || '',
        issues: issues.filter(i => i.projectId === proj.id).map(i => i.id),
      };
    }

    sendJson(res, 200, {
      issues,
      comments: [], // Comments would need separate handling
      projects: projectsObj,
      currentProject,
      savedFilters,
      activityLog,
      issueCounter,
      trash: trashItems,
      sprints,
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
    db.run('DELETE FROM issues');
    db.run('DELETE FROM projects');
    db.run('DELETE FROM sprints');
    db.run('DELETE FROM filters');
    db.run('DELETE FROM trash');

    // Import projects
    if (data.projects) {
      const projectIds = Object.keys(data.projects);
      for (const projId of projectIds) {
        const proj = data.projects[projId];
        db.run(
          'INSERT INTO projects (id, name, key, icon, color, description) VALUES (?, ?, ?, ?, ?, ?)',
          [projId, proj.name, proj.key || projId, proj.icon || '🚀', proj.color || '#0052CC', proj.description || '']
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

    // Import sprints
    if (data.sprints) {
      for (const sprint of data.sprints) {
        db.run(
          'INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [sprint.id, sprint.projectId, sprint.name, sprint.status || 'active', sprint.startDate, sprint.endDate, sprint.goal || '']
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

    // Set current project
    if (data.currentProject) {
      db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)", [data.currentProject]);
    }

    // Set issue counter
    if (data.issueCounter) {
      db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES ('issueCounter', ?)", [String(data.issueCounter)]);
    }

    saveDb();
    sendJson(res, 200, { success: true, message: 'State imported successfully' });
  } catch (error) {
    console.error('setState error:', error);
    sendJson(res, 500, { error: error.message });
  }
}