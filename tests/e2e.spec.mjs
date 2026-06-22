// tests/e2e.spec.mjs - End-to-end tests for Jirito
import { test, expect } from '@playwright/test';
import { clearDb, clearDbEmpty, seedIssues } from './helpers.mjs';

const APP_URL = 'http://127.0.0.1:8080/';

async function navigate(page) {
  const consoleMessages = [];
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });
  
  await page.goto(APP_URL);
  // Wait for the async loadState() to complete so subsequent assertions
  // observe the same data the rest of the app does.
  await page.waitForFunction(() => window.__jiritoStateReady === true, { timeout: 10000 });
  
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
  
  await page.waitForSelector('#board', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(2000);
  
  return { consoleMessages, errors };
}

test.describe('E2E Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    console.log('[e2e] beforeEach: clearing database...');
    await clearDb();
    console.log('[e2e] beforeEach: database cleared');
  });

  test('should load data from server on startup', async ({ page }) => {
    // Uses the standard seedIssues fixture (3 todo, 1 inprogress, 1 review, 1 done = 6 total).
    // The test verifies the data is loaded from the server on the first page load.
    await seedIssues();

    const { consoleMessages, errors } = await navigate(page);
    consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
    if (errors.length > 0) {
      console.log(`JS ERRORS: ${JSON.stringify(errors)}`);
    }

    // All 6 seeded issues should be rendered as cards across the 4 columns.
    const cards = page.locator('#board .issue-card');
    await expect(cards).toHaveCount(6);

    // Spot-check that the seeded titles appear on the board.
    const board = await page.locator('#board').textContent();
    expect(board).toContain('Design login page mockup');
    expect(board).toContain('Fix auth token refresh bug');
    expect(board).toContain('Update dependencies');
  });

  test('should save data to server via UI', async ({ page }) => {
    const { consoleMessages, errors } = await navigate(page);
    consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
    if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);

    await page.locator('#add-issue-btn').click();
    await page.locator('#issue-title').fill('E2E UI Created Issue');
    await page.locator('#issue-desc').fill('Created via E2E test UI');
    await page.locator('#issue-type').selectOption('story');
    await page.locator('#issue-priority').selectOption('high');
    await page.locator('#issue-story-points').fill('5');
    await page.locator('#issue-assignee').fill('Test User');
    await page.locator('#issue-form button[type="submit"]').click();

    await expect(page.locator('#board')).toContainText('E2E UI Created Issue');

    // Wait for the save to complete
    await page.waitForTimeout(1500);
    
    // Verify the issue was saved to the server
    const resp = await page.request.get('http://127.0.0.1:3001/api/issues');
    const issues = await resp.json();
    const found = issues.find(i => i.title === 'E2E UI Created Issue');
    expect(found).toBeDefined();
    expect(found.priority).toBe('high');
  });

  test('should fallback to localStorage when server is down', async ({ page }) => {
    // Seed localStorage with 6 issues BEFORE the page loads, so the app
    // picks them up via the offline-mode fallback path and the new issue
    // we create gets a deterministic ID (PROJ-107, since issueCounter=106
    // after the seed). This makes the test order-independent — it no
    // longer relies on a prior test leaving 6 issues in localStorage
    // (the SAMPLE_FALLBACK that used to provide this was removed in
    // 65e734e "chore(jirito): drop hardcoded localStorage sample issues").
    await page.addInitScript(() => {
      const seeded = {
        issues: [
          { id: 101, title: 'Seed 101', status: 'todo', type: 'task', priority: 'low', rank: 0 },
          { id: 102, title: 'Seed 102', status: 'todo', type: 'task', priority: 'low', rank: 1 },
          { id: 103, title: 'Seed 103', status: 'todo', type: 'task', priority: 'low', rank: 2 },
          { id: 104, title: 'Seed 104', status: 'todo', type: 'task', priority: 'low', rank: 3 },
          { id: 105, title: 'Seed 105', status: 'todo', type: 'task', priority: 'low', rank: 4 },
          { id: 106, title: 'Seed 106', status: 'todo', type: 'task', priority: 'low', rank: 5 },
        ],
        projects: {},
        currentProject: 'default',
        savedFilters: [],
        activityLog: [],
        issueCounter: 106,
        trash: [],
        sprints: {},
        columns: [],
        comments: {},
      };
      localStorage.setItem('jirito-state', JSON.stringify(seeded));
    });

    // Override fetch to block ALL server requests before page loads
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = function(url, ...args) {
        if (typeof url === 'string' && (url.includes('127.0.0.1:3001') || url === '/api/health' || url.startsWith('/api/'))) {
          return Promise.reject(new Error('Connection refused'));
        }
        return originalFetch.call(this, url, ...args);
      };
    });
    
    const consoleMessages = [];
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });
    
    await page.goto(APP_URL);
    
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) {
      await page.locator('#onboarding-skip').click();
    }
    
    await page.waitForSelector('#board', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(2000);
    
    consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
    if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);

    // Verify offline mode is active
    const offlineMsg = await page.evaluate(() => {
      const storage = window.storage;
      return storage ? storage.getStorageType() : 'unknown';
    });
    expect(offlineMsg).toBe('offline');

    // Create an issue — it should be saved to localStorage (not server)
    await page.locator('#add-issue-btn').click();
    await page.locator('#issue-title').fill('Offline Test Issue');
    await page.locator('#issue-desc').fill('Should work offline');
    await page.locator('#issue-type').selectOption('bug');
    await page.locator('#issue-priority').selectOption('medium');
    await page.locator('#issue-form button[type="submit"]').click();

    await expect(page.locator('#board').getByRole('button', { name: 'PROJ-107: Offline Test Issue' })).toBeVisible();

    // Wait for the save to complete
    await page.waitForTimeout(1000);

    // Verify the issue was saved to localStorage
    const stored = await page.evaluate(() => localStorage.getItem('jirito-state'));
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored);
    expect(parsed && parsed.issues && parsed.issues.some(i => i.title === 'Offline Test Issue')).toBe(true);
  });
});

test.describe('Empty state (PR #45 regression)', () => {
  test.beforeEach(async ({ page }) => {
    // Override beforeEach: we want a TRULY empty DB, not the standard
    // Project Alpha fixture, so the empty-state welcome card is visible.
    await clearDbEmpty();
  });

  test('shows the welcome empty state when no projects exist', async ({ page }) => {
    const { errors } = await navigate(page);
    if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);

    // The empty-state welcome card should be present with its CTA.
    await expect(page.locator('#board .board-empty')).toBeVisible();
    await expect(page.locator('#board .board-empty-title'))
      .toContainText('Welcome to Jirito');
    await expect(page.locator('#board-empty-create-btn')).toBeVisible();
    // The four default columns from index.html should NOT be the
    // primary content of the board while the empty state is showing.
    // (The columns exist in the DOM but are visually overshadowed by
    // the centered empty-state container; functionally, no `.column`
    // child should sit at the top of the board's children list.)
    const firstChild = await page.locator('#board > *').first().getAttribute('class');
    expect(firstChild).toContain('board-empty');
  });

  test('creating the first project removes the empty state and shows columns', async ({ page }) => {
    const { errors } = await navigate(page);
    if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);

    // Sanity check: empty state visible before project creation.
    await expect(page.locator('#board .board-empty')).toBeVisible();

    // Create the first project. Use the sidebar's "add project" button
    // (matches the existing `creating a new project switches to it`
    // test in tests.spec.mjs).
    await page.locator('#add-project-btn').click();
    await page.locator('#project-name').fill('First Project');
    await page.locator('#project-key').fill('FP');
    await page.locator('#project-form').evaluate(form => form.requestSubmit());

    // After project creation:
    //   1. The empty-state welcome card MUST be gone (this is the
    //      regression — it used to persist alongside the columns).
    //   2. The four default columns MUST be present and visible.
    await expect(page.locator('#board .board-empty')).toHaveCount(0);
    await expect(page.locator('#board-title')).toContainText('First Project');

    // The four default columns should all be rendered.
    for (const colId of ['todo', 'inprogress', 'review', 'done']) {
      await expect(page.locator(`#board .column[data-col-id="${colId}"]`))
        .toBeVisible();
    }

    // And the empty-state CTA should no longer be reachable.
    await expect(page.locator('#board-empty-create-btn')).toHaveCount(0);
  });
});
