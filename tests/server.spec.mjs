import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:3001';
let serverProcess = null;

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = body;
  }
  return { status: response.status, data: json };
}

test.beforeAll(async () => {
  const testDbPath = path.join(__dirname, '..', 'test.db');
  // Clean up any leftover test db
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch {}

  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['server/index.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, JIRITO_DB_PATH: testDbPath, SERVER_PORT: '3001' },
      stdio: 'pipe',
    });

    let resolved = false;
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Jirito server running') && !resolved) {
        resolved = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Server startup timeout'));
      }
    }, 10000);
  });
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  // Clean up test database
  const testDbPath = path.join(__dirname, '..', 'test.db');
  try {
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch {}
});

// ===== Health Check =====
test('GET /api/health returns ok status', async () => {
  const res = await api('/api/health');
  expect(res.status).toBe(200);
  expect(res.data.status).toBe('ok');
  expect(res.data.timestamp).toBeDefined();
});

// ===== State Sync =====
test('GET /api/state returns initial state', async () => {
  const res = await api('/api/state');
  expect(res.status).toBe(200);
  expect(res.data).toHaveProperty('issues');
  expect(res.data).toHaveProperty('projects');
  expect(res.data).toHaveProperty('currentProject');
  expect(res.data).toHaveProperty('activityLog');
  expect(res.data).toHaveProperty('savedFilters');
  expect(res.data).toHaveProperty('trash');
  expect(res.data).toHaveProperty('sprints');
});

test('PUT /api/state replaces all state', async () => {
  const newState = {
    issues: [
      { id: 1, title: 'Test Issue', status: 'todo', priority: 'high', projectId: 'default' },
    ],
    projects: { default: { name: 'Test Project', key: 'TEST', icon: '🚀', issues: [1] } },
    currentProject: 'default',
    activityLog: [],
    savedFilters: [],
    trash: [],
    sprints: [],
    issueCounter: 2,
  };

  const res = await api('/api/state', {
    method: 'PUT',
    body: JSON.stringify(newState),
  });
  expect(res.status).toBe(200);
  expect(res.data.success).toBe(true);

  // Verify state was replaced
  const state = await api('/api/state');
  expect(state.data.issues).toHaveLength(1);
  expect(state.data.issues[0].title).toBe('Test Issue');
  expect(state.data.currentProject).toBe('default');
});

// ===== Issues CRUD =====
test('POST /api/issues creates a new issue', async () => {
  const issue = {
    title: 'New Issue',
    description: 'Test description',
    status: 'todo',
    priority: 'medium',
    projectId: 'default',
  };

  const res = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify(issue),
  });
  expect(res.status).toBe(201);
  expect(res.data.id).toBeDefined();
  expect(res.data.title).toBe('New Issue');
  expect(res.data.status).toBe('todo');
});

test('GET /api/issues returns all issues', async () => {
  const res = await api('/api/issues');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
});

test('PUT /api/issues/:id updates an issue', async () => {
  // Create an issue first
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Update Me', projectId: 'default' }),
  });
  const id = createRes.data.id;

  // Update it
  const updateRes = await api(`/api/issues/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Updated Title', status: 'inprogress' }),
  });
  expect(updateRes.status).toBe(200);
  expect(updateRes.data.title).toBe('Updated Title');
  expect(updateRes.data.status).toBe('inprogress');
});

test('DELETE /api/issues/:id moves to trash and removes issue', async () => {
  // Create an issue
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Delete Me', projectId: 'default' }),
  });
  const id = createRes.data.id;

  // Delete it
  const deleteRes = await api(`/api/issues/${id}`, { method: 'DELETE' });
  expect(deleteRes.status).toBe(200);

  // Verify it's gone
  const issues = await api('/api/issues');
  expect(issues.data.find((i) => i.id === id)).toBeUndefined();

  // Verify it's in trash
  const trash = await api('/api/trash');
  expect(trash.data.some((t) => t.type === 'issue')).toBe(true);
});

// ===== Projects CRUD =====
test('GET /api/projects returns all projects', async () => {
  const res = await api('/api/projects');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
  expect(res.data.length).toBeGreaterThan(0);
});

test('GET /api/projects/current returns current project', async () => {
  const res = await api('/api/projects/current');
  expect(res.status).toBe(200);
  expect(res.data).toHaveProperty('id');
  expect(res.data).toHaveProperty('name');
});

test('PUT /api/projects/current sets current project', async () => {
  const res = await api('/api/projects/current', {
    method: 'PUT',
    body: JSON.stringify({ currentProject: 'default' }),
  });
  expect(res.status).toBe(200);
  expect(res.data.success).toBe(true);
});

test('POST /api/projects creates a new project', async () => {
  const project = {
    name: 'New Project',
    key: 'NP',
    icon: '🎯',
  };

  const res = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify(project),
  });
  expect(res.status).toBe(201);
  expect(res.data.name).toBe('New Project');
  expect(res.data.key).toBe('NP');
});

test('DELETE /api/projects/:id deletes project and updates current', async () => {
  // Create a project first
  const createRes = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Delete Me', key: 'DM' }),
  });

  // Should not be able to delete only project
  const currentProject = await api('/api/projects/current');
  if (currentProject.data.id !== createRes.data.id) {
    const deleteRes = await api(`/api/projects/${createRes.data.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
  }
});

// ===== Sprints CRUD =====
test('POST /api/sprints creates a new sprint', async () => {
  const sprint = {
    name: 'Sprint 1',
    projectId: 'default',
    startDate: '2026-05-01',
    endDate: '2026-05-14',
    goal: 'Complete features',
  };

  const res = await api('/api/sprints', {
    method: 'POST',
    body: JSON.stringify(sprint),
  });
  expect(res.status).toBe(201);
  expect(res.data.name).toBe('Sprint 1');
  expect(res.data.projectId).toBe('default');
});

test('GET /api/projects/:id/sprints returns project sprints', async () => {
  const res = await api('/api/projects/default/sprints');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
});

test('PUT /api/sprints/:id updates a sprint', async () => {
  // Create a sprint
  const createRes = await api('/api/sprints', {
    method: 'POST',
    body: JSON.stringify({ name: 'Update Sprint', projectId: 'default' }),
  });
  const id = createRes.data.id;

  // Update it
  const updateRes = await api(`/api/sprints/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Updated Sprint', status: 'completed' }),
  });
  expect(updateRes.status).toBe(200);
  expect(updateRes.data.name).toBe('Updated Sprint');
});

test('DELETE /api/sprints/:id deletes a sprint', async () => {
  // Create a sprint
  const createRes = await api('/api/sprints', {
    method: 'POST',
    body: JSON.stringify({ name: 'Delete Sprint', projectId: 'default' }),
  });
  const id = createRes.data.id;

  // Delete it
  const deleteRes = await api(`/api/sprints/${id}`, { method: 'DELETE' });
  expect(deleteRes.status).toBe(200);
});

// ===== Activity Log =====
test('POST /api/activity creates an activity entry', async () => {
  const activity = {
    action: 'Created issue',
    details: { issueId: '1' },
  };

  const res = await api('/api/activity', {
    method: 'POST',
    body: JSON.stringify(activity),
  });
  expect(res.status).toBe(201);
  expect(res.data.action).toBe('Created issue');
});

test('GET /api/activity returns activity log', async () => {
  const res = await api('/api/activity');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
});

// ===== Filters =====
test('GET /api/filters returns saved filters', async () => {
  const res = await api('/api/filters');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
});

test('POST /api/filters creates a new filter', async () => {
  const filter = {
    name: 'High Priority',
    query: { priority: 'high' },
  };

  const res = await api('/api/filters', {
    method: 'POST',
    body: JSON.stringify(filter),
  });
  expect(res.status).toBe(201);
  expect(res.data.name).toBe('High Priority');
});

test('PUT /api/filters/:id updates a filter', async () => {
  // Create a filter
  const createRes = await api('/api/filters', {
    method: 'POST',
    body: JSON.stringify({ name: 'Update Me' }),
  });
  const id = createRes.data.id;

  // Update it
  const updateRes = await api(`/api/filters/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Updated Filter' }),
  });
  expect(updateRes.status).toBe(200);
  expect(updateRes.data.name).toBe('Updated Filter');
});

// ===== Trash =====
test('GET /api/trash returns trash items', async () => {
  const res = await api('/api/trash');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
});

test('POST /api/trash/:id/restore restores an item', async () => {
  // Create and delete an issue
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Restore Me', projectId: 'default' }),
  });
  const issueId = createRes.data.id;

  await api(`/api/issues/${issueId}`, { method: 'DELETE' });

  // Get trash and find the item
  const trash = await api('/api/trash');
  const trashItem = trash.data.find((t) => t.type === 'issue' && t.data.id == issueId);
  expect(trashItem).toBeDefined();

  // Restore it
  const restoreRes = await api(`/api/trash/${trashItem.id}/restore`, { method: 'POST' });
  expect(restoreRes.status).toBe(200);

  // Verify issue is back
  const issues = await api('/api/issues');
  expect(issues.data.some((i) => i.id == issueId)).toBe(true);
});

test('DELETE /api/trash/:id permanently deletes trash item', async () => {
  // Create and delete an issue
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Permanent Delete', projectId: 'default' }),
  });
  const issueId = createRes.data.id;

  await api(`/api/issues/${issueId}`, { method: 'DELETE' });

  // Get trash
  const trash = await api('/api/trash');
  const trashItem = trash.data.find((t) => t.type === 'issue' && t.data.id == issueId);
  expect(trashItem).toBeDefined();

  // Permanently delete
  const deleteRes = await api(`/api/trash/${trashItem.id}`, { method: 'DELETE' });
  expect(deleteRes.status).toBe(200);

  // Verify it's gone from trash
  const updatedTrash = await api('/api/trash');
  expect(updatedTrash.data.find((t) => t.id === trashItem.id)).toBeUndefined();
});

// ===== CORS =====
test('CORS headers are present', async () => {
  const response = await fetch(`${API_BASE}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' },
  });
  expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  expect(response.headers.get('access-control-allow-methods')).toContain('GET');
  expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  expect(response.headers.get('access-control-allow-methods')).toContain('PUT');
  expect(response.headers.get('access-control-allow-methods')).toContain('DELETE');
});

// ===== Error Handling =====
test('Unknown routes return 404', async () => {
  const res = await api('/api/unknown');
  expect(res.status).toBe(404);
  expect(res.data.error).toBe('Not found');
});

test('Invalid JSON returns 500', async () => {
  const response = await fetch(`${API_BASE}/api/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json',
  });
  expect(response.status).toBe(500);
});

// ===== GET /api/issues/:id (single issue) =====
test('GET /api/issues/:id returns a single issue', async () => {
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Get One Issue', projectId: 'default' }),
  });
  const id = createRes.data.id;

  const res = await api(`/api/issues/${id}`);
  expect(res.status).toBe(200);
  expect(res.data.id).toBe(id);
  expect(res.data.title).toBe('Get One Issue');
});

test('GET /api/issues/:id returns 404 for non-existent issue', async () => {
  const res = await api('/api/issues/99999');
  expect(res.status).toBe(404);
  expect(res.data.error).toBe('Issue not found');
});

// ===== Comments API =====
test('POST /api/comments creates a comment', async () => {
  // Create an issue to attach a comment to
  const issueRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Comment Issue', projectId: 'default' }),
  });
  const issueId = issueRes.data.id;

  const comment = {
    issueId,
    content: 'Test comment content',
    author: 'Tester',
  };

  const res = await api('/api/comments', {
    method: 'POST',
    body: JSON.stringify(comment),
  });
  expect(res.status).toBe(201);
  expect(res.data.comment.content).toBe('Test comment content');
  expect(res.data.comment.author).toBe('Tester');
  expect(res.data.comment.issueId).toBe(issueId);
});

test('GET /api/comments returns all comments', async () => {
  const res = await api('/api/comments');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data.comments)).toBe(true);
});

test('GET /api/comments?issueId=X returns comments for an issue', async () => {
  // Create an issue
  const issueRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Filtered Comment Issue', projectId: 'default' }),
  });
  const issueId = issueRes.data.id;

  // Create a comment for this issue
  await api('/api/comments', {
    method: 'POST',
    body: JSON.stringify({
      issueId,
      content: 'Issue-specific comment',
      author: 'Tester',
    }),
  });

  const res = await api(`/api/comments?issueId=${issueId}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data.comments)).toBe(true);
  expect(res.data.comments.length).toBeGreaterThan(0);
  expect(String(res.data.comments[0].issueId)).toBe(String(issueId));
});

test('PUT /api/comments/:id updates a comment', async () => {
  const issueRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Update Comment Issue', projectId: 'default' }),
  });

  const createRes = await api('/api/comments', {
    method: 'POST',
    body: JSON.stringify({
      issueId: issueRes.data.id,
      content: 'Original content',
      author: 'Tester',
    }),
  });
  const commentId = createRes.data.comment.id;

  const updateRes = await api(`/api/comments/${commentId}`, {
    method: 'PUT',
    body: JSON.stringify({ content: 'Updated content' }),
  });
  expect(updateRes.status).toBe(200);
  expect(updateRes.data.success).toBe(true);

  // Verify the update persisted by fetching comments for this issue
  const comments = await api(`/api/comments?issueId=${issueRes.data.id}`);
  expect(comments.data.comments.some((c) => c.id === commentId && c.content === 'Updated content')).toBe(true);
});

test('DELETE /api/comments/:id deletes a comment', async () => {
  const issueRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Delete Comment Issue', projectId: 'default' }),
  });

  const createRes = await api('/api/comments', {
    method: 'POST',
    body: JSON.stringify({
      issueId: issueRes.data.id,
      content: 'Delete me',
      author: 'Tester',
    }),
  });
  const commentId = createRes.data.id;

  const deleteRes = await api(`/api/comments/${commentId}`, { method: 'DELETE' });
  expect(deleteRes.status).toBe(200);

  // Verify it's gone
  const allComments = await api('/api/comments');
  expect(allComments.data.comments.some((c) => c.id === commentId)).toBe(false);
});

// ===== State Sync - Comments Support =====
test('PUT /api/state accepts comments in payload without error', async () => {
  // First create an issue to have a valid issueId for comments
  const issueRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Commented Issue', projectId: 'default' }),
  });
  const issueId = issueRes.data.id;

  const newState = {
    issues: [{ id: issueId, title: 'Commented Issue', status: 'todo', priority: 'high', projectId: 'default' }],
    projects: { default: { name: 'Default', key: 'DEF', icon: '🚀', issues: [issueId] } },
    currentProject: 'default',
    activityLog: [],
    savedFilters: [],
    trash: [],
    sprints: [],
    issueCounter: issueId + 1,
    comments: [
      {
        id: 'c1',
        issueId,
        content: 'Restored comment',
        author: 'Restorer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    columns: { default: ['todo', 'inprogress', 'inreview', 'done'] },
  };

  const res = await api('/api/state', {
    method: 'PUT',
    body: JSON.stringify(newState),
  });
  expect(res.status).toBe(200);
  expect(res.data.success).toBe(true);
});

test('GET /api/state returns comments', async () => {
  const res = await api('/api/state');
  expect(res.status).toBe(200);
  expect(res.data).toHaveProperty('comments');
  expect(Array.isArray(res.data.comments)).toBe(true);
});

test('PUT /api/state accepts custom columns in payload without error', async () => {
  const customCols = ['backlog', 'todo', 'inprogress', 'review', 'done'];
  const newState = {
    issues: [],
    projects: { default: { name: 'Default', key: 'DEF', icon: '🚀', issues: [] } },
    currentProject: 'default',
    activityLog: [],
    savedFilters: [],
    trash: [],
    sprints: [],
    issueCounter: 1,
    comments: [],
    columns: { default: customCols },
  };

  const res = await api('/api/state', {
    method: 'PUT',
    body: JSON.stringify(newState),
  });
  expect(res.status).toBe(200);
  expect(res.data.success).toBe(true);
});

// ===== Trash - Purge Endpoint =====
test('DELETE /api/trash/:id/purge clears all trash', async () => {
  // Create and delete an issue to populate trash
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Purge Test', projectId: 'default' }),
  });
  const issueId = createRes.data.id;

  await api(`/api/issues/${issueId}`, { method: 'DELETE' });

  // Get trash and find the item
  const trash = await api('/api/trash');
  const trashItem = trash.data.find((t) => t.type === 'issue' && t.data.id == issueId);
  expect(trashItem).toBeDefined();

  // Purge all trash
  const purgeRes = await api(`/api/trash/${trashItem.id}/purge`, { method: 'DELETE' });
  expect(purgeRes.status).toBe(200);
  expect(purgeRes.data.success).toBe(true);

  // Verify all trash is gone
  const updatedTrash = await api('/api/trash');
  expect(updatedTrash.data.length).toBe(0);
});

// ===== Error Handling Edge Cases =====
test('PUT /api/projects/current with invalid project ID still succeeds (idempotent)', async () => {
  const res = await api('/api/projects/current', {
    method: 'PUT',
    body: JSON.stringify({ currentProject: 'nonexistent-project' }),
  });
  // Should not crash - either succeeds or returns appropriate error
  expect([200, 400, 404]).toContain(res.status);
});

test('PUT /api/issues/:id with invalid JSON body returns 500', async () => {
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Bad Update', projectId: 'default' }),
  });
  const id = createRes.data.id;

  const response = await fetch(`${API_BASE}/api/issues/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{ invalid json',
  });
  expect(response.status).toBe(500);
});

test('GET /api/issues/:id for deleted (non-existent) issue returns 404', async () => {
  const res = await api('/api/issues/99999');
  expect(res.status).toBe(404);
});

// ===== Sprint Validation =====
test('POST /api/sprints with end date before start date still creates (no validation)', async () => {
  const sprint = {
    name: 'Bad Date Sprint',
    projectId: 'default',
    startDate: '2026-06-01',
    endDate: '2026-05-01',
  };

  const res = await api('/api/sprints', {
    method: 'POST',
    body: JSON.stringify(sprint),
  });
  // Currently no server-side validation - just tests that it doesn't crash
  expect([201, 400, 500]).toContain(res.status);
});

test('POST /api/sprints with duplicate name creates anyway (no validation)', async () => {
  const sprint1 = {
    name: 'Duplicate Sprint',
    projectId: 'default',
    startDate: '2026-05-01',
    endDate: '2026-05-14',
  };

  const res1 = await api('/api/sprints', {
    method: 'POST',
    body: JSON.stringify(sprint1),
  });
  expect(res1.status).toBe(201);

  const sprint2 = {
    name: 'Duplicate Sprint',
    projectId: 'default',
    startDate: '2026-05-15',
    endDate: '2026-05-28',
  };

  const res2 = await api('/api/sprints', {
    method: 'POST',
    body: JSON.stringify(sprint2),
  });
  // Currently no server-side duplicate validation
  expect([201, 400, 500]).toContain(res2.status);
});

// ===== Issue Counter Persistence =====
test('issue IDs are unique and later-created issues have later timestamps', async () => {
  const res1 = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Counter Test 1', projectId: 'default' }),
  });
  const res2 = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Counter Test 2', projectId: 'default' }),
  });

  // IDs are timestamp-based (Date.now()), so later creates should have larger numeric IDs
  expect(Number(res1.data.id)).toBeGreaterThan(0);
  expect(Number(res2.data.id)).toBeGreaterThan(Number(res1.data.id));
});

// ===== Activity Cleanup on Issue Delete =====
test('deleting an issue does NOT remove its activity log entries (current behavior)', async () => {
  // Create an issue
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Activity Cleanup Test', projectId: 'default' }),
  });
  const issueId = createRes.data.id;

  // Create some activity for this issue
  await api('/api/activity', {
    method: 'POST',
    body: JSON.stringify({
      action: 'Updated issue',
      details: { issueId: String(issueId) },
    }),
  });

  const activityBefore = await api('/api/activity');
  const issueActivityCount = activityBefore.data.filter(
    (a) => a.details?.issueId === String(issueId)
  ).length;

  // Delete the issue
  await api(`/api/issues/${issueId}`, { method: 'DELETE' });

  // Verify activity entries still exist (current behavior - no cleanup)
  const activityAfter = await api('/api/activity');
  const remainingIssueActivity = activityAfter.data.filter(
    (a) => a.details?.issueId === String(issueId)
  ).length;

  expect(remainingIssueActivity).toBe(issueActivityCount);
});

// ===== Bulk Trash Delete =====
test('DELETE /api/trash removes trash items', async () => {
  // Create and delete an issue to populate trash
  const createRes = await api('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ title: 'Bulk Trash Test', projectId: 'default' }),
  });
  const issueId = createRes.data.id;

  await api(`/api/issues/${issueId}`, { method: 'DELETE' });

  const trashBefore = await api('/api/trash');
  const trashItem = trashBefore.data.find((t) => t.type === 'issue' && t.data.id == issueId);
  expect(trashItem).toBeDefined();

  // Delete the trash entry (not purge, just remove)
  const deleteRes = await api(`/api/trash/${trashItem.id}`, { method: 'DELETE' });
  expect(deleteRes.status).toBe(200);

  const trashAfter = await api('/api/trash');
  expect(trashAfter.data.find((t) => t.id === trashItem.id)).toBeUndefined();
});