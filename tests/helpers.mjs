// tests/helpers.mjs - Test utilities for E2E tests

const API_URL = 'http://127.0.0.1:3001';

export async function clearDb() {
  try {
    // Reset to a known fixture state. Project Alpha is now part of the
    // test fixture (not auto-seeded by the app — see
    // references/2026-06-21-no-demo-data.md). Tests that switch between
    // projects or test deletion semantics rely on this starting project
    // existing.
    await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issues: [],
        projects: {
          default: {
            id: 'default',
            name: 'Project Alpha',
            key: 'PROJ',
            icon: '🚀',
            color: '#0052CC',
            description: '',
            issues: [],
          },
        },
        currentProject: 'default',
        savedFilters: [],
        activityLog: [],
        issueCounter: 100,  // so first seeded issue gets ID 101 (PROJ-101)
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
  console.log('[seedIssues] Seeding issues...');
  // Seed a full set of test issues matching the original sample data
  // (3 todo, 1 inprogress, 1 inreview, 1 done = 6 total)
  const issues = [
    { title: 'Design login page mockup', description: 'Create wireframes for the new login flow', type: 'story', priority: 'high', status: 'todo', storyPoints: 5, sprint: '', assignee: 'Alice', dueDate: '2026-05-15', rank: 0, labels: ['design'] },
    { title: 'Fix auth token refresh bug', description: 'Tokens expire too early on mobile', type: 'bug', priority: 'high', status: 'inprogress', storyPoints: 3, sprint: '', assignee: 'Bob', dueDate: '2026-05-01', rank: 1, labels: ['bug', 'auth'] },
    { title: 'Set up CI/CD pipeline', description: 'GitHub Actions for staging and prod', type: 'task', priority: 'medium', status: 'todo', storyPoints: 8, sprint: '', assignee: 'Charlie', dueDate: '2026-06-01', rank: 2, labels: ['devops'] },
    { title: 'Write API documentation', description: 'OpenAPI spec for all endpoints', type: 'story', priority: 'medium', status: 'review', storyPoints: 5, sprint: '', assignee: 'Alice', dueDate: '', rank: 3, labels: ['docs'] },
    { title: 'Update dependencies', description: 'Bump all npm packages to latest', type: 'task', priority: 'low', status: 'done', storyPoints: 2, sprint: '', assignee: 'Bob', dueDate: '2026-04-20', rank: 4, labels: [] },
    { title: 'Implement dark mode toggle', description: 'Add theme switcher in settings', type: 'story', priority: 'low', status: 'todo', storyPoints: 3, sprint: '', assignee: 'Diana', dueDate: '', rank: 5, labels: ['feature'] },
  ];
  for (const issue of issues) {
    try {
      const resp = await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issue),
      });
      const created = await resp.json();
      console.log('[seedIssues] Created issue:', created.id, created.title, 'dueDate:', created.dueDate);
    } catch (e) {
      // Server might not be running
      console.log('[seedIssues] Error creating issue:', e.message);
    }
  }
  // Verify issues were created
  const stateResp = await fetch(`${API_URL}/api/state`);
  const stateData = await stateResp.json();
  console.log('[seedIssues] After seed, API issues:', JSON.stringify(stateData.issues.map(i => ({id:i.id, dueDate:i.dueDate}))));
}

export async function clearDbEmpty() {
  // Reset to a *truly* empty state (no projects, no current project) so
  // the empty-state UI is shown. The default `clearDb()` seeds a
  // "default" project, which would suppress the empty state and hide the
  // regression we're trying to exercise. Use this helper in tests that
  // cover the empty-state → create-first-project flow.
  try {
    await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issues: [],
        projects: {},
        currentProject: '',
        savedFilters: [],
        activityLog: [],
        issueCounter: 1,
        trash: [],
        sprints: {},
        columns: [],
        comments: {},
      }),
    });
  } catch {
    // Server might not be running
  }
}
