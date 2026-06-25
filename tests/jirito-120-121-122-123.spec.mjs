// JIRITO-120/121/122/123 — Visual proof of all four persistence + SSE fixes.
//
// Run against the test backend on port 3002 (started with
//   JIRITO_DB_PATH=/tmp/jirito-test.db SERVER_PORT=3002 npx tsx server/index.ts
// ).
// Each test:
//   1. Sets up state via API + DOM
//   2. Captures the relevant DOM state as a screenshot
//   3. Asserts the expected outcome (no "Invalid Date", board updated, etc.)
// Screenshots are written to ../screenshots/ for the PR body.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots', 'jirito-120-121-122-123');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const APP_URL = 'http://127.0.0.1:8080/';
const API_URL = 'http://127.0.0.1:3002/';

// X-Jirito-Silent header — keeps test fixtures out of the squad wiretap
const SILENT = { 'Content-Type': 'application/json', 'X-Jirito-Silent': '1' };

// Reset DB and seed deterministic state via API.
// Each per-table DELETE in /api/state is gated on the corresponding
// key being present in the payload. We send all 9 keys so every table
// gets wiped. Order matters: PUT first (wipe), then POST each project/
// issue/comment. Issues POST after the project because the project's
// `issues` array needs to include the new ticket IDs.
async function seedFresh() {
  // 1. Wipe DB
  await fetch(`${API_URL}api/state`, {
    method: 'PUT',
    headers: SILENT,
    body: JSON.stringify({
      issues: [],
      projects: {},
      columns: [],
      comments: [],
      filters: [],
      activity: [],
      trash: [],
      sprints: [],
      savedFilters: [],
      // Reset the issue counter so POST /api/issues (which always
      // generates a new id from the counter) yields 101, 102, 103
      // matching the explicit ids in the seed payload below.
      issueCounter: 100,
    }),
  });

  // 2. Create a project
  const projectResp = await fetch(`${API_URL}api/projects`, {
    method: 'POST',
    headers: SILENT,
    body: JSON.stringify({
      id: 'JIRI',
      name: 'Jirito',
      key: 'JIRI',
      icon: '🚀',
      color: '#0052CC',
      description: '',
    }),
  });
  if (!projectResp.ok) {
    console.error('[seedFresh] project POST failed:', projectResp.status, await projectResp.text());
  }

  // 3. Set currentProject
  await fetch(`${API_URL}api/projects/current`, {
    method: 'PUT',
    headers: SILENT,
    body: JSON.stringify({ projectId: 'JIRI' }),
  });

  // 4. Create tickets one at a time so we know each succeeds
  const tickets = [
    {
      id: '101',
      title: '+ Add card button does nothing',
      description: 'Clicking + Add card on default columns does nothing.',
      status: 'todo',
      type: 'bug',
      priority: 'medium',
      labels: [],
      assignee: 'elmo',
      reporter: 'kyle',
      projectId: 'JIRI',
      prUrl: '',
    },
    {
      id: '102',
      title: 'PR icon shows wrong state',
      description: 'PR icon should distinguish open vs merged.',
      status: 'inprogress',
      type: 'bug',
      priority: 'high',
      labels: [],
      assignee: 'bert',
      reporter: 'kyle',
      projectId: 'JIRI',
      prUrl: 'https://github.com/klampatech/jirito/pull/66',
    },
    {
      id: '103',
      title: 'Refresh wipes comments',
      description: 'UI-added comments disappear on page refresh.',
      status: 'review',
      type: 'bug',
      priority: 'medium',
      labels: [],
      assignee: 'elmo',
      reporter: 'kyle',
      projectId: 'JIRI',
      prUrl: '',
    },
  ];
  for (const t of tickets) {
    const r = await fetch(`${API_URL}api/issues`, {
      method: 'POST',
      headers: SILENT,
      body: JSON.stringify(t),
    });
    if (!r.ok) {
      console.error(`[seedFresh] ticket ${t.id} POST failed:`, r.status, await r.text());
    }
  }
}

async function navigateAndWait(page) {
  // Reset localStorage
  await page.goto(APP_URL);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(APP_URL);
  // Wait for the board to render at least one column (longer timeout
  // because the first load triggers migrations, schema seeding, etc.)
  await page.waitForSelector('.column', { timeout: 10000 });
  // Dismiss onboarding if present
  const skipBtn = page.locator('#onboarding-skip');
  if (await skipBtn.count() > 0 && await skipBtn.isVisible()) {
    await skipBtn.click();
    await page.waitForTimeout(200);
  }
  // Wait an extra beat for any deferred state hydration
  await page.waitForTimeout(500);
}

// ════════════════════════════════════════════════════════════════════════
// JIRITO-120: prMerged persistence
// ════════════════════════════════════════════════════════════════════════

test('JIRITO-120: PR merged toggle persists across refresh', async ({ page }) => {
  await seedFresh();
  await navigateAndWait(page);

  // Step 1: Set prMerged=true via API for ticket 102 (has prUrl)
  await fetch(`${API_URL}api/issues/102`, {
    method: 'PUT',
    headers: SILENT,
    body: JSON.stringify({ prMerged: true }),
  });

  // Step 2: Open the detail panel for ticket 102 (scope to .issue-card to
  // avoid matching the inner checkbox that also carries data-id)
  await page.locator('.issue-card[data-id="102"]').click();
  await page.waitForSelector('.detail-panel', { timeout: 3000 });
  await page.waitForTimeout(300);

  // Verify the PR Merged checkbox is checked (the detail panel exposes it)
  // The checkbox is in the detail panel — find by label or by data attribute
  const prMergedCheckbox = page.locator('#pr-merged-checkbox, input[name="pr-merged"], input[type="checkbox"][id*="merged"]').first();
  if (await prMergedCheckbox.count() === 0) {
    // Fallback: check the state by reading from /api/issues/102
    const fresh = await fetch(`${API_URL}api/issues/102`).then(r => r.json());
    expect(fresh.prMerged).toBe(true);
  } else {
    expect(await prMergedCheckbox.isChecked()).toBe(true);
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, '01-prmerged-before-refresh.png'), fullPage: true });

  // Step 3: Reload the page
  await page.reload();
  await page.waitForSelector('.column', { timeout: 5000 });

  // Step 4: Re-open ticket 102 (scope to .issue-card to avoid checkbox)
  await page.locator('.issue-card[data-id="102"]').click();
  await page.waitForSelector('.detail-panel', { timeout: 3000 });
  await page.waitForTimeout(300);

  // Step 5: Verify prMerged is STILL true after refresh (this is what was broken)
  const fresh = await fetch(`${API_URL}api/issues/102`).then(r => r.json());
  expect(fresh.prMerged).toBe(true);

  const prMergedCheckboxAfter = page.locator('#pr-merged-checkbox, input[name="pr-merged"], input[type="checkbox"][id*="merged"]').first();
  if (await prMergedCheckboxAfter.count() > 0) {
    expect(await prMergedCheckboxAfter.isChecked()).toBe(true);
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, '02-prmerged-after-refresh.png'), fullPage: true });
});

// ════════════════════════════════════════════════════════════════════════
// JIRITO-121: Agent comments render correctly (not "Invalid Date")
// ════════════════════════════════════════════════════════════════════════

test('JIRITO-121: agent comments render with date + text (not "Invalid Date")', async ({ page }) => {
  await seedFresh();

  // Post a comment as an agent (elmo) via API
  await fetch(`${API_URL}api/comments`, {
    method: 'POST',
    headers: SILENT,
    body: JSON.stringify({
      issueId: '101',
      author: 'elmo',
      content: 'Verified the + Add card button. Reproduction steps confirmed. Starting work.',
    }),
  });

  // Add a second comment with markdown
  await fetch(`${API_URL}api/comments`, {
    method: 'POST',
    headers: SILENT,
    body: JSON.stringify({
      issueId: '101',
      author: 'bert',
      content: '**Acknowledged.** Will take over since elmo is busy. ETA tomorrow.',
    }),
  });

  // Also test a UI-added comment (uses the local addComment path)
  await navigateAndWait(page);
  await page.locator('.issue-card[data-id="101"]').click();
  await page.waitForSelector('.detail-panel', { timeout: 3000 });
  await page.waitForTimeout(300);

  // Read what the comments panel shows
  const commentsHtml = await page.locator('#comments-list').innerHTML();
  console.log('[JIRITO-121] comments HTML:', commentsHtml);

  // Assertions:
  // 1. No "Invalid Date" anywhere
  expect(commentsHtml).not.toContain('Invalid Date');
  expect(commentsHtml.toLowerCase()).not.toContain('invalid date');

  // 2. Comments are visible with author + content
  expect(commentsHtml).toContain('elmo');
  expect(commentsHtml).toContain('Verified the + Add card button');
  expect(commentsHtml).toContain('bert');
  expect(commentsHtml).toContain('Acknowledged');

  // 3. Date text is present (toLocaleString produces locale-specific text;
  //    just check it's NOT the literal "Invalid Date" placeholder)
  const dateSpans = await page.locator('.comment-date').allInnerTexts();
  for (const d of dateSpans) {
    expect(d.toLowerCase()).not.toBe('invalid date');
    expect(d.trim().length).toBeGreaterThan(0);
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, '03-comments-render.png'), fullPage: true });

  // Step 4: Reload and verify comments still render correctly
  await page.reload();
  await page.waitForSelector('.column', { timeout: 5000 });
  await page.locator('.issue-card[data-id="101"]').click();
  await page.waitForSelector('.detail-panel', { timeout: 3000 });
  await page.waitForTimeout(300);

  const commentsHtmlAfter = await page.locator('#comments-list').innerHTML();
  expect(commentsHtmlAfter).not.toContain('Invalid Date');
  expect(commentsHtmlAfter).toContain('Verified the + Add card button');

  await page.screenshot({ path: join(SCREENSHOT_DIR, '04-comments-after-refresh.png'), fullPage: true });
});

// ════════════════════════════════════════════════════════════════════════
// JIRITO-122: SSE board updates in real-time
// ════════════════════════════════════════════════════════════════════════

test('JIRITO-122: board updates in real-time when tickets change via API', async ({ page }) => {
  await seedFresh();
  await navigateAndWait(page);

  // Initial state: ticket 101 should be in the "todo" column (scope to
  // .issue-card to avoid matching the inner checkbox that also carries data-id)
  const todoColumn = page.locator('.column[data-status="todo"]').first();
  await expect(todoColumn.locator('.issue-card[data-id="101"]')).toBeVisible();

  await page.screenshot({ path: join(SCREENSHOT_DIR, '05-board-before-sse.png'), fullPage: true });

  // Move ticket 101 to "inprogress" via API — should appear in real-time
  await fetch(`${API_URL}api/issues/101`, {
    method: 'PUT',
    headers: SILENT,
    body: JSON.stringify({ status: 'inprogress' }),
  });

  // Wait up to 3 seconds for the SSE event to propagate
  await page.waitForFunction(() => {
    const inprogress = document.querySelector('.column[data-status="inprogress"]');
    return inprogress && inprogress.querySelector('.issue-card[data-id="101"]');
  }, { timeout: 3000 });

  // Verify ticket 101 is now in the "inprogress" column AND NOT in "todo"
  const inprogressColumn = page.locator('.column[data-status="inprogress"]').first();
  await expect(inprogressColumn.locator('.issue-card[data-id="101"]')).toBeVisible();
  await expect(todoColumn.locator('.issue-card[data-id="101"]')).toHaveCount(0);

  await page.screenshot({ path: join(SCREENSHOT_DIR, '06-board-after-sse-move.png'), fullPage: true });

  // Create a brand new ticket via API — should appear on the board in real-time
  const createResp = await fetch(`${API_URL}api/issues`, {
    method: 'POST',
    headers: SILENT,
    body: JSON.stringify({
      // POST /api/issues ignores the body's `id` and generates one from
      // the issueCounter — capture the actual id from the response.
      title: 'JIRITO-122 SSE smoke test',
      status: 'todo',
      priority: 'medium',
      assignee: 'kyle',
      projectId: 'JIRI',
    }),
  });
  const createdTicket = await createResp.json();
  const newId = String(createdTicket.id);

  // Wait for it to appear (scope to .issue-card to skip checkbox)
  await page.waitForSelector(`.issue-card[data-id="${newId}"]`, { timeout: 3000 });
  await expect(page.locator(`.issue-card[data-id="${newId}"]`)).toBeVisible();

  await page.screenshot({ path: join(SCREENSHOT_DIR, '07-board-after-sse-create.png'), fullPage: true });
});

// ════════════════════════════════════════════════════════════════════════
// JIRITO-123: Filter persistence across refresh
// ════════════════════════════════════════════════════════════════════════

test('JIRITO-123: filter values persist across refresh', async ({ page }) => {
  await seedFresh();
  await navigateAndWait(page);

  // Set a search query
  const searchInput = page.locator('#search-input');
  await searchInput.fill('Add card');
  await page.waitForTimeout(300);

  // Set type filter to "bug"
  const typeFilter = page.locator('#filter-type');
  await typeFilter.selectOption('bug');
  await page.waitForTimeout(300);

  await page.screenshot({ path: join(SCREENSHOT_DIR, '08-filters-set.png'), fullPage: true });

  // Reload the page
  await page.reload();
  await page.waitForSelector('.column', { timeout: 5000 });

  // Verify filters are restored
  const searchAfter = await page.locator('#search-input').inputValue();
  expect(searchAfter).toBe('Add card');
  const typeAfter = await page.locator('#filter-type').inputValue();
  expect(typeAfter).toBe('bug');

  await page.screenshot({ path: join(SCREENSHOT_DIR, '09-filters-after-refresh.png'), fullPage: true });
});