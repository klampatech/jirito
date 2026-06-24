// tests/helpers.mjs - Test utilities for E2E tests
//
// IMPORTANT: tests run against a TEST backend on port 3002 with an isolated
// DB at /tmp/jirito-test.db — NEVER against the live jirito.service on
// port 3001 / ./jirito.db. See playwright/playwright-global-setup.mjs and
// tests/helpers.isolation.test.mjs for the invariants that lock this in.
// If the playwright global setup hasn't run yet (e.g. node --test
// directly), the test server is expected to be reachable on the test
// port — start it manually with: JIRITO_DB_PATH=/tmp/jirito-test.db \
//   SERVER_PORT=3002 npx tsx server/index.ts
import { getTestContext } from '../playwright/playwright-shared.mjs';

// Resolve at call time so the test-context module's exports are populated
// by the time the global setup has finished. Falls back to the default
// test port (3002) so standalone helpers/seed runs that bypass the
// playwright setup still hit the right server.
function testApiUrl() {
  const ctx = getTestContext();
  return `http://127.0.0.1:${ctx.testPort}`;
}

const API_URL = testApiUrl();

// X-Jirito-Silent: 1 — see server/webhooks.ts isSilentRequest(). The
// dispatcher wraps the handler in runSilent() when this header is
// present, so emitEvent / broadcastEvent / the per-issue diff loop
// in state.ts all early-return. The DB still gets written — only
// the Discord-bound events are suppressed. Without this, every
// beforeEach() that seeds fixtures fires 6 ticket.created events
// to the squad wiretap, and a 50-test suite produces 300+ messages.
export const TEST_HEADERS = {
  'Content-Type': 'application/json',
  'X-Jirito-Silent': '1',
};

export async function clearDb() {
  try {
    // Reset to a known fixture state. Project Alpha is now part of the
    // test fixture (not auto-seeded by the app — see
    // references/2026-06-21-no-demo-data.md). Tests that switch between
    // projects or test deletion semantics rely on this starting project
    // existing.
    await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: TEST_HEADERS,
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

// Default issue set used by resetAndSeed(). Matches the original
// seedIssues() exactly so existing tests that rely on titles, ranks,
// assignees, dueDates, etc. keep working. IDs are explicit so the
// bulk PUT is deterministic — first new POST after reset creates
// PROJ-107 (matches the existing e2e.spec.mjs "fallback to
// localStorage" test which expects PROJ-107).
const SEED_ISSUES = [
  { id: 101, title: 'Design login page mockup', description: 'Create wireframes for the new login flow', type: 'story', priority: 'high', status: 'todo', storyPoints: 5, sprint: '', assignee: 'Alice', reporter: 'Kyle', projectId: 'default', sprintId: null, rank: 0, parentIssueId: null, dueDate: '2026-05-15', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', labels: ['design'] },
  { id: 102, title: 'Fix auth token refresh bug', description: 'Tokens expire too early on mobile', type: 'bug', priority: 'high', status: 'inprogress', storyPoints: 3, sprint: '', assignee: 'Bob', reporter: 'Kyle', projectId: 'default', sprintId: null, rank: 1, parentIssueId: null, dueDate: '2026-05-01', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', labels: ['bug', 'auth'] },
  { id: 103, title: 'Set up CI/CD pipeline', description: 'GitHub Actions for staging and prod', type: 'task', priority: 'medium', status: 'todo', storyPoints: 8, sprint: '', assignee: 'Charlie', reporter: 'Kyle', projectId: 'default', sprintId: null, rank: 2, parentIssueId: null, dueDate: '2026-06-01', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', labels: ['devops'] },
  { id: 104, title: 'Write API documentation', description: 'OpenAPI spec for all endpoints', type: 'story', priority: 'medium', status: 'review', storyPoints: 5, sprint: '', assignee: 'Alice', reporter: 'Kyle', projectId: 'default', sprintId: null, rank: 3, parentIssueId: null, dueDate: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', labels: ['docs'] },
  { id: 105, title: 'Update dependencies', description: 'Bump all npm packages to latest', type: 'task', priority: 'low', status: 'done', storyPoints: 2, sprint: '', assignee: 'Bob', reporter: 'Kyle', projectId: 'default', sprintId: null, rank: 4, parentIssueId: null, dueDate: '2026-04-20', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', labels: [] },
  { id: 106, title: 'Implement dark mode toggle', description: 'Add theme switcher in settings', type: 'story', priority: 'low', status: 'todo', storyPoints: 3, sprint: '', assignee: 'Diana', reporter: 'Kyle', projectId: 'default', sprintId: null, rank: 5, parentIssueId: null, dueDate: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', labels: ['feature'] },
];

/**
 * Reset the database AND seed the default 6 issues in a single
 * PUT /api/state call. Replaces the old clearDb() + seedIssues()
 * pair, which made 1 PUT + 6 POSTs (each POST firing a
 * ticket.created event to the squad wiretap). Tests should prefer
 * this; the old pair is kept for any caller that needs the
 * per-create path exercised (currently none).
 *
 * One PUT, one DB transaction, no events.
 */
export async function resetAndSeed() {
  try {
    await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: TEST_HEADERS,
      body: JSON.stringify({
        issues: SEED_ISSUES,
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
        issueCounter: 106,  // last seed = 106; next POST yields PROJ-107
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

/**
 * @deprecated Prefer resetAndSeed(). Kept for callers that need
 * each issue to be created through the POST /api/issues handler
 * (none exist in the current suite — they all just need the data
 * present in the DB).
 */
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
        headers: TEST_HEADERS,
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
  const stateResp = await fetch(`${API_URL}/api/state`, { headers: TEST_HEADERS });
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
      headers: TEST_HEADERS,
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
        comments: [],   // must be an array — server's setState does `for (const c of data.comments)`
                         // (server/routes/state.ts:298) which throws TypeError on a plain object.
                         // clearDb() above uses [] for the same reason; mirror it here.
      }),
    });
  } catch {
    // Server might not be running
  }
}
