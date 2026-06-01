// tests/helpers.mjs - Test utilities for E2E tests

const API_URL = 'http://127.0.0.1:3001';

export async function clearDb() {
  try {
    // Use setState with empty data to clear all tables atomically.
    // This avoids UNIQUE constraint errors on subsequent state imports
    // (columns, sprints, filters, trash, comments, etc. were previously
    // not cleared by setState, causing constraint failures).
    await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issues: [],
        projects: {},
        currentProject: 'default',
        savedFilters: [],
        activityLog: [],
        issueCounter: 1,
        trash: [],
        sprints: {},
        columns: [],
        comments: [],
      }),
    });
  } catch {
    // Server might not be running
  }
}

export async function seedIssues() {
  const issues = [
    { title: 'E2E Test Issue 1', description: 'Test description 1', type: 'story', priority: 'medium', status: 'todo', storyPoints: 3, sprint: '', assignee: '', dueDate: '' },
    { title: 'E2E Test Issue 2', description: 'Test description 2', type: 'bug', priority: 'high', status: 'todo', storyPoints: 5, sprint: '', assignee: '', dueDate: '' },
    { title: 'E2E Test Issue 3', description: 'Test description 3', type: 'task', priority: 'low', status: 'done', storyPoints: 1, sprint: '', assignee: '', dueDate: '' },
  ];
  for (const issue of issues) {
    try {
      await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issue),
      });
    } catch {
      // Server might not be running
    }
  }
}
