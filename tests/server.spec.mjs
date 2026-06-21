// ===== Server Integration Tests =====
// Run with: node --test tests/server.spec.mjs
// Requires: server running at http://localhost:3001

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const API_BASE = "http://localhost:3001/api";

// Default caller for the integration tests. The JIRITO-101 gap fix
// (server/routes/_shared.ts:validateVerdictCaller) requires a
// reviewer-class X-Jirito-Caller header for verdict content. Tests
// that exercise verdicts override this with fetchJson(method, path,
// body, { caller: "elmo" }) or similar. The default mirrors what the
// CLI sends in production (kyle running the test suite by hand).
const DEFAULT_CALLER = "kyle";

// ===== Helpers =====

async function fetchJson(method, path, body, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Jirito-Caller": opts.caller ?? DEFAULT_CALLER,
  };
  const reqOpts = { method, headers };
  if (body !== undefined) {
    reqOpts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, reqOpts);
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
    assert.ok(typeof data.sprints === 'object');
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
      // 2026-06-20: PR #38 added status normalization. Sending the
      // underscore form should now return the canonical no-underscore
      // form. Sending the canonical form is a no-op normalization.
      status: 'in_progress',
      priority: 'critical',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'inprogress');
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

describe('Close-Verification Gate (JIRITO-101 "already handled" burn, 2026-06-21)', () => {
  // Helper to create a fresh ticket for each test so the gate behavior
  // doesn't depend on cross-test ordering. We use a per-test prefix to
  // keep the audit trail clear if anyone goes looking at the DB after.
  async function makeTicket(titlePrefix, status = 'inprogress', caller = 'kyle') {
    const { status: code, data } = await fetchJson('POST', '/issues', {
      title: `${titlePrefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'task',
      status,
      assignee: 'elmo',
      projectId: 'JIR',
    }, { caller });
    assert.strictEqual(code, 201, `expected 201 from POST /issues, got ${code}`);
    return data;
  }

  it('rejects agent close to "done" without verification (400)', async () => {
    const issue = await makeTicket('close-gate: no verification');
    const { status, data } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
    }, { caller: 'elmo' });
    assert.strictEqual(status, 400);
    assert.match(data.error, /Verification required/);
    assert.ok(data.hint, '400 response should include a hint for the agent');
  });

  it('rejects agent close with too-short verification (400)', async () => {
    const issue = await makeTicket('close-gate: short verification');
    const { status, data } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
      verification: 'too short',
    }, { caller: 'elmo' });
    assert.strictEqual(status, 400);
    assert.match(data.error, /Verification required/);
  });

  it('accepts agent close to "done" with valid verification (200 + auto-comment)', async () => {
    const issue = await makeTicket('close-gate: valid verification');
    const verification = 'verified in browser: deleted a project and refreshed, project did NOT reappear';
    const { status, data } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
      verification,
    }, { caller: 'elmo' });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'done');

    // Auto-comment with [auto-verification] prefix should now exist.
    const commentsRes = await fetch(
      `${API_BASE}/comments?issueId=${issue.id}`,
      { headers: { 'X-Jirito-Caller': 'kyle' } }
    );
    const comments = await commentsRes.json();
    const auto = comments.find(c => c.content === `[auto-verification] ${verification}`);
    assert.ok(auto, 'expected an [auto-verification] comment matching the verification text');
    assert.strictEqual(auto.author, 'elmo');
  });

  it('accepts agent close to "trash" with verification (200)', async () => {
    const issue = await makeTicket('close-gate: trash with verification');
    const { status } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'trash',
      verification: 'duplicate of #101, already handled by prior work',
    }, { caller: 'elmo' });
    assert.strictEqual(status, 200);
  });

  it('lets Kyle (human) close without verification (user override)', async () => {
    const issue = await makeTicket('close-gate: kyle bypass');
    const { status, data } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
    }, { caller: 'kyle' });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'done');
  });

  it('lets Evo (parent agent) close without verification (parent override)', async () => {
    const issue = await makeTicket('close-gate: evo bypass');
    const { status, data } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
    }, { caller: 'evo' });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'done');
  });

  it('does NOT require verification when agent moves to "review"', async () => {
    const issue = await makeTicket('close-gate: review, no verification');
    const { status, data } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'review',
    }, { caller: 'elmo' });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'review');
  });

  it('does NOT require verification on idempotent re-PUT (no transition)', async () => {
    const issue = await makeTicket('close-gate: idempotent done');
    // First, close it as kyle to set the canonical state.
    await fetchJson('PUT', `/issues/${issue.id}`, { status: 'done' }, { caller: 'kyle' });
    // Idempotent re-PUT by an agent without verification should be fine
    // because the status didn't change (and a no-op is not a transition).
    const { status } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
    }, { caller: 'elmo' });
    assert.strictEqual(status, 200);
  });

  it('auto-verification comment is idempotent (no duplicate on repeated close)', async () => {
    const issue = await makeTicket('close-gate: idempotent auto-comment');
    const verification = 'verified in browser: drag-drop reorder persists across refresh, see PR #50';

    // First close: creates auto-comment.
    await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
      verification,
    }, { caller: 'elmo' });

    // Move back to inprogress (kyle can do this freely).
    await fetchJson('PUT', `/issues/${issue.id}`, { status: 'inprogress' }, { caller: 'kyle' });

    // Re-close with the SAME verification text — should NOT create a duplicate.
    await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
      verification,
    }, { caller: 'elmo' });

    const commentsRes = await fetch(
      `${API_BASE}/comments?issueId=${issue.id}`,
      { headers: { 'X-Jirito-Caller': 'kyle' } }
    );
    const comments = await commentsRes.json();
    const matches = comments.filter(c => c.content === `[auto-verification] ${verification}`);
    assert.strictEqual(matches.length, 1, 'expected exactly one auto-verification comment, not duplicates');
  });

  it('rejected close attempt does NOT mutate the issue row', async () => {
    const issue = await makeTicket('close-gate: rejected mutation check');
    const originalUpdatedAt = issue.updatedAt;

    const { status } = await fetchJson('PUT', `/issues/${issue.id}`, {
      status: 'done',
    }, { caller: 'elmo' });
    assert.strictEqual(status, 400);

    // Re-fetch — status should still be inprogress, updatedAt unchanged.
    const res = await fetch(`${API_BASE}/issues/${issue.id}`, {
      headers: { 'X-Jirito-Caller': 'kyle' },
    });
    const fresh = await res.json();
    assert.strictEqual(fresh.status, 'inprogress', 'rejected close should not change status');
    assert.strictEqual(fresh.updatedAt, originalUpdatedAt, 'rejected close should not bump updatedAt');
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
      author: 'kyle',
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.content, 'Test comment from integration tests');
    assert.strictEqual(data.author, 'kyle');
  });

  it('should reject POST /api/comments with an unknown author (400)', async () => {
    const { status, data } = await fetchJson('POST', '/comments', {
      issueId: '1',
      content: 'Test comment from random author',
      author: 'rando_xyz',
    });
    assert.strictEqual(status, 400);
    assert.match(data.error, /unknown author/);
  });

  it('should reject POST /api/comments with a missing author (400)', async () => {
    const { status, data } = await fetchJson('POST', '/comments', {
      issueId: '1',
      content: 'Test comment with no author',
    });
    assert.strictEqual(status, 400);
    assert.match(data.error, /author is required/);
  });

  it('should accept a verdict comment from a reviewer (evo)', async () => {
    const { status, data } = await fetchJson('POST', '/comments', {
      issueId: '1',
      content: 'Review verdict: PASS — clean PR with 3 files',
      author: 'evo',
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.author, 'evo');
  });

  it('should REJECT a verdict comment from a squad agent (400)', async () => {
    // Burn 2026-06-20: JIRITO-101. elmo posted a "Review verdict: PASS"
    // comment with author=evo. This is the exact case the new gate
    // blocks — elmo cannot post a verdict, full stop.
    const { status, data } = await fetchJson(
      'POST',
      '/comments',
      {
        issueId: '1',
        content: 'Review verdict: PASS — my own work, trust me',
        author: 'elmo',
      },
      { caller: 'elmo' }
    );
    assert.strictEqual(status, 400);
    assert.match(data.error, /verdict comments must be posted by a reviewer/);
  });

  // ───── JIRITO-101 impersonation-gap tests (Layer 2: caller gate) ─────
  // The body-author gate (Layer 1) only checks the body's `author`
  // field, which any caller can set to anything. The X-Jirito-Caller
  // header is the caller identity — set by the CLI / agent harness,
  // not by the request body. A verdict is only valid if the CALLER
  // is a reviewer, regardless of what the body's `author` claims.
  // These tests pin the case the PR body originally failed to
  // cover: elmo (caller) posting a verdict with body author=evo.

  it('should REJECT a verdict attributed to a reviewer when caller is a squad agent (the original burn)', async () => {
    // The body gate (Layer 1) would PASS this (author="evo" is a
    // reviewer). The caller gate (Layer 2) is what closes it. Without
    // the caller gate, the JIRITO-101 burn would still be possible.
    const { status, data } = await fetchJson(
      'POST',
      '/comments',
      {
        issueId: '1',
        content: 'Review verdict: PASS — my own work, trust me',
        author: 'evo', // body claim — but the caller is the truth
      },
      { caller: 'elmo' } // elmo's harness is the real caller
    );
    assert.strictEqual(status, 400);
    assert.match(
      data.error,
      /reviewer caller.*elmo|reviewer caller.*evo\/kyle\/system/
    );
  });

  it('should REJECT a verdict with NO X-Jirito-Caller header (400)', async () => {
    // Bypass fetchJson so we can omit the header entirely. Same as a
    // misbehaving curl invocation that forgets the new header.
    const res = await fetch(`${API_BASE}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issueId: '1',
        content: 'Review verdict: PASS',
        author: 'evo',
      }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.match(data.error, /X-Jirito-Caller/);
  });

  it('should ACCEPT a verdict from caller=kyle attributed to author=evo (kyle posts on behalf of evo)', async () => {
    // The body's author and the caller's identity CAN differ — Kyle
    // reviewing a PR and attributing the verdict to Evo (e.g. when
    // Kyle is acting as Evo's stand-in or wants the audit trail to
    // say "evo approved" but is the human in the loop).
    const { status, data } = await fetchJson(
      'POST',
      '/comments',
      {
        issueId: '1',
        content: 'Review verdict: PASS — kyle posting as evo',
        author: 'evo',
      },
      { caller: 'kyle' }
    );
    assert.strictEqual(status, 201);
    assert.strictEqual(data.author, 'evo');
  });

  it('should ACCEPT a verdict from caller=evo attributed to author=evo (self-attribution)', async () => {
    const { status, data } = await fetchJson(
      'POST',
      '/comments',
      {
        issueId: '1',
        content: 'Review verdict: PASS — self-attributed',
        author: 'evo',
      },
      { caller: 'evo' }
    );
    assert.strictEqual(status, 201);
  });

  it('should ACCEPT a regular (non-verdict) comment from caller=elmo (no caller check on non-verdicts)', async () => {
    // The caller gate is verdict-only. Regular comments flow through
    // just fine — the body author gate is enough.
    const { status, data } = await fetchJson(
      'POST',
      '/comments',
      {
        issueId: '1',
        content: 'Working on the column-config fix.',
        author: 'elmo',
      },
      { caller: 'elmo' }
    );
    assert.strictEqual(status, 201);
    assert.strictEqual(data.author, 'elmo');
  });

  it('should accept a synthetic system comment (cmd_triage flow)', async () => {
    // The CLI's `jirito triage` posts "[auto] Triaged to X." with
    // author="system" — must continue to work.
    const { status, data } = await fetchJson('POST', '/comments', {
      issueId: '1',
      content: '[auto] Triaged to elmo.',
      author: 'system',
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.author, 'system');
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
    // 2026-06-20: the author allowlist gate (server/routes/_shared.ts)
    // rejects PUTs without an author. Pass one explicitly.
    const { status, data } = await fetchJson('PUT', `/comments/${comments[0].id}`, {
      content: 'Updated test comment',
      author: 'kyle',
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

// ===== Import/Export Tests =====

describe('Export', () => {
  it('should export all data with correct structure', async () => {
    // First ensure some data exists
    await fetchJson('POST', '/issues', {
      title: 'Export Test Issue',
      description: 'For export verification',
      status: 'backlog',
      priority: 'medium',
      labels: ['test'],
      assignee: 'tester',
      reporter: 'tester',
      projectId: 'default',
      storyPoints: 3,
    });

    const { status, data } = await fetchJson('GET', '/export');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.issues));
    assert.ok(typeof data.projects === 'object');
    assert.ok(typeof data.currentProject === 'string');
    assert.ok(Array.isArray(data.savedFilters));
    assert.ok(Array.isArray(data.activityLog));
    assert.ok(typeof data.issueCounter === 'number');
    assert.ok(Array.isArray(data.trash));
    assert.ok(typeof data.sprints === 'object');
  });

  it('should export data matching frontend storage format', async () => {
    const { status, data } = await fetchJson('GET', '/export');
    assert.strictEqual(status, 200);

    // Verify the exported format matches what storage.js expects
    // storage.js _loadFromServer expects: issues, projects, currentProject, savedFilters, activityLog, issueCounter, trash, sprints
    assert.ok('issues' in data, 'export must include issues');
    assert.ok('projects' in data, 'export must include projects');
    assert.ok('currentProject' in data, 'export must include currentProject');
    assert.ok('savedFilters' in data, 'export must include savedFilters');
    assert.ok('activityLog' in data, 'export must include activityLog');
    assert.ok('issueCounter' in data, 'export must include issueCounter');
    assert.ok('trash' in data, 'export must include trash');
    assert.ok('sprints' in data, 'export must include sprints');
    assert.ok('comments' in data, 'export must include comments');
  });

  it('should export empty data when DB is empty', async () => {
    const { status, data } = await fetchJson('GET', '/export');
    assert.strictEqual(status, 200);
    // Should have valid empty structures
    assert.ok(Array.isArray(data.issues));
    assert.ok(typeof data.projects === 'object');
    assert.ok(typeof data.currentProject === 'string');
    assert.ok(typeof data.issueCounter === 'number');
  });
});

describe('Import', () => {
  it('should import valid JSON data', async () => {
    const testIssue = {
      id: 'import-test-1',
      title: 'Imported Test Issue',
      description: 'Created via import endpoint',
      status: 'backlog',
      priority: 'high',
      labels: ['imported', 'test'],
      assignee: 'importer',
      reporter: 'importer',
      projectId: 'default',
      sprintId: null,
      storyPoints: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const importPayload = {
      issues: [testIssue],
      projects: {
        'default': { name: 'Default', key: 'DEF', icon: '🚀', color: '#0052CC', description: '', issues: ['import-test-1'] },
      },
      currentProject: 'default',
      savedFilters: [],
      activityLog: [],
      issueCounter: 100,
      trash: [],
      sprints: [],
    };

    const { status, data } = await fetchJson('POST', '/import', importPayload);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.imported.issues, 1);
    assert.strictEqual(data.imported.projects, 1);

    // Verify the issue was actually stored in the DB
    const issuesRes = await fetch(`${API_BASE}/issues`);
    const issues = await issuesRes.json();
    const importedIssue = issues.find(i => i.id === 'import-test-1');
    assert.ok(importedIssue, 'imported issue should exist in DB');
    assert.strictEqual(importedIssue.title, 'Imported Test Issue');
  });

  it('should reject malformed import data', async () => {
    const { status, data } = await fetchJson('POST', '/import', {
      issues: 'not-an-array',
      projects: {},
    });
    assert.strictEqual(status, 400);
    assert.ok(data.error, 'should return an error message');
  });

  it('should clear existing data on import', async () => {
    // First create a known issue
    const { data: created } = await fetchJson('POST', '/issues', {
      title: 'Pre-Import Issue',
      description: 'Should be cleared',
      status: 'backlog',
      priority: 'medium',
      labels: [],
      assignee: '',
      reporter: '',
      projectId: 'default',
      storyPoints: 0,
    });

    // Now import different data
    const importPayload = {
      issues: [{
        id: 'import-only-1',
        title: 'Import-Only Issue',
        description: 'This is the only issue after import',
        status: 'done',
        priority: 'low',
        labels: ['imported'],
        assignee: '',
        reporter: '',
        projectId: 'default',
        sprintId: null,
        storyPoints: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      projects: {
        'default': { name: 'Default', key: 'DEF', icon: '🚀', color: '#0052CC', description: '', issues: ['import-only-1'] },
      },
      currentProject: 'default',
      savedFilters: [],
      activityLog: [],
      issueCounter: 200,
      trash: [],
      sprints: [],
    };

    const { status } = await fetchJson('POST', '/import', importPayload);
    assert.strictEqual(status, 200);

    // Verify only the imported issue exists
    const issuesRes = await fetch(`${API_BASE}/issues`);
    const issues = await issuesRes.json();
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].id, 'import-only-1');
    assert.strictEqual(issues[0].title, 'Import-Only Issue');
  });

  it('should handle empty import gracefully', async () => {
    const { status, data } = await fetchJson('POST', '/import', {
      issues: [],
      projects: {},
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
  });
});
