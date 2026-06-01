// tests/helpers.mjs - Test utilities for E2E tests

const API_URL = 'http://127.0.0.1:3001';

export async function clearDb() {
  try {
    // Get all issues first
    const resp = await fetch(`${API_URL}/api/issues`);
    const issues = await resp.json();
    // Delete each issue
    for (const issue of issues) {
      await fetch(`${API_URL}/api/issues/${issue.id}`, { method: 'DELETE' });
    }
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
