// ===== Server Integration Tests =====
// Run with: node --test tests/server.spec.mjs
// Requires: server running at http://localhost:3001

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE = 'http://localhost:3001/api';

// ===== Helpers =====

async function fetchJson(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Test Suites =====

describe('Health Check', () => {
  it('should return 200 from /api/health', async () => {
    const res = await fetch(`${API_BASE}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.ok(data.timestamp);
  });
});

describe('State Sync', () => {
  it('should return state from GET /api/state', async () => {
    const res = await fetch(`${API_BASE}/state`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.issues));
    assert.ok(typeof data.projects === 'object');
    assert.ok(data.currentProject);
    assert.ok(Array.isArray(data.savedFilters));
    assert.ok(Array.isArray(data.activityLog));
    assert.ok(Array.isArray(data.trash));
    assert.ok(Array.isArray(data.sprints));
  });

  it('should accept state via PUT /api/state', async () => {
    const testState = {
      issues: [
        {
          id: '999',
          title: 'Test Issue',
          description: 'Test',
          status: 'backlog',
          priority: 'medium',
          labels: [],
          assignee: '',
          reporter: '',
          projectId: 'test',
          sprintId: null,
          storyPoints: 0,
          parentIssueId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      projects: { test: { name: 'Test', key: 'TEST', icon: '\uD83D\uDE80', color: '#0052CC', description: '', issues: ['999'] } },
      currentProject: 'test',
      savedFilters: [],
      activityLog: [],
      issueCounter: 1000,
      trash: [],
      sprints: [],
    };
    const res = await fetch(`${API_BASE}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testState),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });
});

describe('Issues CRUD', () => {
  it('should create an issue via POST /api/issues', async () => {
    const issue = {
      title: 'Phase 3 Test Issue',
      description: 'Created by integration tests',
      status: 'backlog',
      priority: 'high',
      labels: ['test', 'phase3'],
      assignee: 'tester',
      reporter: 'tester',
      projectId: 'default',
      storyPoints: 5,
    };
    const { status, data } = await fetchJson('POST', '/issues', issue);
    assert.strictEqual(status, 201);
    assert.ok(data.id);
    assert.strictEqual(data.title, issue.title);
    assert.strictEqual(data.priority, issue.priority);
    assert.deepStrictEqual(data.labels, issue.labels);
  });

  it('should get all issues via GET /api/issues', async () => {
    const res = await fetch(`${API_BASE}/issues`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
  });

  it('should update an issue via PUT /api/issues/:id', async () => {
    // Get an issue first
    const res = await fetch(`${API_BASE}/issues`);
    const issues = await res.json();
    if (issues.length === 0) {
      console.warn('Skipping update test: no issues exist');
      return;
    }
    const issue = issues[0];
    const { status, data } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'in_progress',
      priority: 'critical',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'in_progress');
    assert.strictEqual(data.priority, 'critical');
  });

  it('should return 404 for non-existent issue', async () => {
    const res = await fetch(`${API_BASE}/issues/nonexistent`);
    assert.strictEqual(res.status, 404);
  });

  it('should delete an issue via DELETE /api/issues/:id', async () => {
    // Get an issue to delete
    const res = await fetch(`${API_BASE}/issues`);
    const issues = await res.json();
    if (issues.length === 0) {
      console.warn('Skipping delete test: no issues exist');
      return;
    }
    const issue = issues[0];
    const { status } = await fetchJson('DELETE', `/issues/${issue.id}`);
    assert.strictEqual(status, 200);
  });
});

describe('Projects CRUD', () => {
  it('should list projects via GET /api/projects', async () => {
    const res = await fetch(`${API_BASE}/projects`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });

  it('should get current project via GET /api/projects/current', async () => {
    const res = await fetch(`${API_BASE}/projects/current`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.id);
    assert.ok(data.name);
  });

  it('should set current project via PUT /api/projects/current', async () => {
    const res = await fetch(`${API_BASE}/projects`);
    const projects = await res.json();
    const projId = projects.length > 0 ? projects[0].id : 'default';
    const { status, data } = await fetchJson('PUT', '/projects/current', {
      currentProject: projId,
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
  });

  it('should create a project via POST /api/projects', async () => {
    const { status, data } = await fetchJson('POST', '/projects', {
      name: 'Test Project',
      key: 'TP',
      icon: '\uD83C\uDFAF',
      color: '#FF5630',
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.name, 'Test Project');
    assert.strictEqual(data.key, 'TP');
  });

  it('should delete a project via DELETE /api/projects/:id', async () => {
    // Get a project to delete (not the only one)
    const res = await fetch(`${API_BASE}/projects`);
    const projects = await res.json();
    if (projects.length <= 1) {
      console.warn('Skipping project delete test: only one project exists');
      return;
    }
    const project = projects.find(p => p.key !== 'JIR');
    if (!project) {
      console.warn('Skipping project delete test: no non-default project found');
      return;
    }
    const { status } = await fetchJson('DELETE', `/projects/${project.id}`);
    assert.strictEqual(status, 200);
  });
});

describe('Sprints CRUD', () => {
  it('should create a sprint via POST /api/sprints', async () => {
    const { status, data } = await fetchJson('POST', '/sprints', {
      projectId: 'default',
      name: 'Test Sprint',
      status: 'active',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      goal: 'Test sprint goal',
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.name, 'Test Sprint');
    assert.strictEqual(data.projectId, 'default');
  });

  it('should get sprints via GET /api/projects/:id/sprints', async () => {
    const res = await fetch(`${API_BASE}/projects/default/sprints`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });

  it('should update a sprint via PUT /api/sprints/:id', async () => {
    const res = await fetch(`${API_BASE}/projects/default/sprints`);
    const sprints = await res.json();
    if (sprints.length === 0) {
      console.warn('Skipping sprint update test: no sprints exist');
      return;
    }
    const { status, data } = await fetchJson('PUT', `/sprints/${sprints[0].id}`, {
      status: 'closed',
      goal: 'Updated goal',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'closed');
  });

  it('should delete a sprint via DELETE /api/sprints/:id', async () => {
    const res = await fetch(`${API_BASE}/projects/default/sprints`);
    const sprints = await res.json();
    if (sprints.length === 0) {
      console.warn('Skipping sprint delete test: no sprints exist');
      return;
    }
    const { status } = await fetchJson('DELETE', `/sprints/${sprints[0].id}`);
    assert.strictEqual(status, 200);
  });
});

describe('Activity Log', () => {
  it('should add activity via POST /api/activity', async () => {
    const { status, data } = await fetchJson('POST', '/activity', {
      action: 'Test',
      details: { message: 'Integration test activity' },
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.action, 'Test');
  });

  it('should get activity via GET /api/activity', async () => {
    const res = await fetch(`${API_BASE}/activity?limit=10`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });
});

describe('Filters CRUD', () => {
  it('should create a filter via POST /api/filters', async () => {
    const { status, data } = await fetchJson('POST', '/filters', {
      name: 'Test Filter',
      query: { status: 'backlog' },
      sortOrder: 0,
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.name, 'Test Filter');
  });

  it('should get filters via GET /api/filters', async () => {
    const res = await fetch(`${API_BASE}/filters`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });

  it('should update a filter via PUT /api/filters/:id', async () => {
    const res = await fetch(`${API_BASE}/filters`);
    const filters = await res.json();
    if (filters.length === 0) {
      console.warn('Skipping filter update test: no filters exist');
      return;
    }
    const { status, data } = await fetchJson('PUT', `/filters/${filters[0].id}`, {
      name: 'Updated Filter',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.name, 'Updated Filter');
  });

  it('should delete a filter via DELETE /api/filters/:id', async () => {
    const res = await fetch(`${API_BASE}/filters`);
    const filters = await res.json();
    if (filters.length === 0) {
      console.warn('Skipping filter delete test: no filters exist');
      return;
    }
    const { status } = await fetchJson('DELETE', `/filters/${filters[0].id}`);
    assert.strictEqual(status, 200);
  });
});

describe('Trash', () => {
  it('should list trash via GET /api/trash', async () => {
    const res = await fetch(`${API_BASE}/trash`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });
});

describe('Comments', () => {
  it('should add a comment via POST /api/comments', async () => {
    const { status, data } = await fetchJson('POST', '/comments', {
      issueId: '1',
      content: 'Test comment from integration tests',
      author: 'tester',
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.content, 'Test comment from integration tests');
  });

  it('should get comments via GET /api/comments', async () => {
    const res = await fetch(`${API_BASE}/comments`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });

  it('should update a comment via PUT /api/comments/:id', async () => {
    const res = await fetch(`${API_BASE}/comments`);
    const comments = await res.json();
    if (comments.length === 0) {
      console.warn('Skipping comment update test: no comments exist');
      return;
    }
    const { status, data } = await fetchJson('PUT', `/comments/${comments[0].id}`, {
      content: 'Updated test comment',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.content, 'Updated test comment');
  });

  it('should delete a comment via DELETE /api/comments/:id', async () => {
    const res = await fetch(`${API_BASE}/comments`);
    const comments = await res.json();
    if (comments.length === 0) {
      console.warn('Skipping comment delete test: no comments exist');
      return;
    }
    const { status } = await fetchJson('DELETE', `/comments/${comments[0].id}`);
    assert.strictEqual(status, 200);
  });
});

describe('CORS', () => {
  it('should include CORS headers', async () => {
    const res = await fetch(`${API_BASE}/health`);
    assert.ok(res.headers.get('Access-Control-Allow-Origin'));
  });

  it('should handle OPTIONS preflight', async () => {
    const res = await fetch(`${API_BASE}/health`, { method: 'OPTIONS' });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, DELETE, OPTIONS');
  });
});
