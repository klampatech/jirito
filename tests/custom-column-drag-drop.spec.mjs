import { test, expect } from '@playwright/test';
import { clearDb, seedIssues } from './helpers.mjs';

const APP_URL = 'http://127.0.0.1:8080/';
const API_URL = 'http://127.0.0.1:3001';

test.beforeEach(async ({ page }) => {
  // Clear the database so each test starts fresh
  await clearDb();
  // Seed default issues
  await seedIssues();
  // Navigate to the app via the static server (proxies /api/ to backend)
  await page.goto(APP_URL, { waitUntil: 'load' });
  // Force reset to initial state - clear localStorage and reload
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'load' });
  // Wait for sidebar to render
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  // Dismiss onboarding if it appears
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
});

// Helper: Create a custom column via the server API
async function createCustomColumn(page, name, color = '#9E9E9E') {
  // First get current state from server
  const stateRes = await page.evaluate(async () => {
    const res = await fetch('/api/state');
    return res.json();
  });
  
  // Add new column to existing columns
  const columns = stateRes.columns || [];
  const id = 'col-' + Date.now();
  columns.push({ 
    id, 
    name, 
    query: { color, status: null },
    sortOrder: columns.length 
  });
  
  // Save back to server via PUT /api/state
  await page.evaluate(async (data) => {
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }, { ...stateRes, columns });
  
  return id;
}

// Helper: Move issue to custom column via API
async function moveIssueToCustomColumn(page, issueId, columnId) {
  await page.evaluate(async ({ id, customColumnId }) => {
    await fetch(`/api/issues/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customColumnId })
    });
  }, { id: issueId, customColumnId: columnId });
}

// Helper: Get issue details
async function getIssue(page, issueId) {
  return await page.evaluate(async (id) => {
    const res = await fetch(`/api/issues/${id}`);
    return res.json();
  }, issueId);
}

// Helper: Get issues by customColumnId
async function getIssuesByCustomColumn(page, columnId) {
  return await page.evaluate(async (colId) => {
    const res = await fetch('/api/issues');
    const issues = await res.json();
    return issues
      .filter(i => i.customColumnId === colId)
      .map(i => ({ id: i.id, title: i.title, rank: i.rank, customColumnId: i.customColumnId }))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }, columnId);
}

// ===== Custom Column Creation Tests =====

test('custom column appears in the board', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify the column exists
  const column = page.locator(`.column[data-col-id="${colId}"]`);
  await expect(column).toBeVisible();
  await expect(column.locator('.column-title span:nth-child(2)')).toHaveText('Backlog');
});

test('custom column shows zero count when empty', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify count shows 0
  const countEl = page.locator(`[data-count-for="${colId}"]`);
  await expect(countEl).toHaveText('0');
});

// ===== Custom Column Assignment Tests =====

test('issue assigned to custom column via API appears in column', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  // Move an issue to the custom column via API
  await moveIssueToCustomColumn(page, 101, colId);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify the issue appears in the custom column
  const cardInCustomCol = page.locator(`.column[data-col-id="${colId}"] .issue-card[data-id="101"]`);
  await expect(cardInCustomCol).toBeVisible();
});

test('custom column count updates when issues are assigned', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  // Initial count should be 0
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  const countEl = page.locator(`[data-count-for="${colId}"]`);
  await expect(countEl).toHaveText('0');

  // Move an issue to the custom column
  await moveIssueToCustomColumn(page, 101, colId);

  // Reload to see the update
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Count should now be 1
  await expect(countEl).toHaveText('1');
});

test('issue moved from custom column to status column clears customColumnId', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  // Move an issue to the custom column
  await moveIssueToCustomColumn(page, 101, colId);

  // Verify it's in the custom column
  let issue = await getIssue(page, 101);
  expect(issue.customColumnId).toBe(colId);

  // Move it to 'inprogress' via API
  await page.evaluate(async () => {
    await fetch('/api/issues/101', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inprogress', customColumnId: null })
    });
  });

  // Verify status changed and customColumnId cleared
  issue = await getIssue(page, 101);
  expect(issue.status).toBe('inprogress');
  expect(issue.customColumnId).toBeNull();
});

test('multiple issues in custom column are sorted by rank', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  // Move two issues to the custom column with different ranks
  await moveIssueToCustomColumn(page, 101, colId);
  await page.evaluate(async () => {
    await fetch('/api/issues/101', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rank: 2 })
    });
  });
  
  await moveIssueToCustomColumn(page, 103, colId);
  await page.evaluate(async () => {
    await fetch('/api/issues/103', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rank: 1 })
    });
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify both are in the custom column and sorted by rank
  const customCards = page.locator(`.column[data-col-id="${colId}"] .issue-card`);
  await expect(customCards).toHaveCount(2);
  
  // First card should be the one with lower rank (103 with rank 1)
  await expect(customCards.first().locator('.issue-key')).toHaveText('PROJ-103');
  // Second card should be the one with higher rank (101 with rank 2)
  await expect(customCards.nth(1).locator('.issue-key')).toHaveText('PROJ-101');
});

// ===== Persistence Tests =====

test('customColumnId persists across page reload', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  // Move an issue to custom column
  await moveIssueToCustomColumn(page, 101, colId);

  // Verify it's in custom column
  let issue = await getIssue(page, 101);
  expect(issue.customColumnId).toBe(colId);

  // Reload the page
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify customColumnId persisted
  issue = await getIssue(page, 101);
  expect(issue.customColumnId).toBe(colId);

  // Verify card still appears in custom column
  const cardInCustomCol = page.locator(`.column[data-col-id="${colId}"] .issue-card[data-id="101"]`);
  await expect(cardInCustomCol).toBeVisible();
});

// ===== Column Delete Tests =====

test('deleting a custom column moves cards to To Do', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  // Move an issue to custom column
  await moveIssueToCustomColumn(page, 101, colId);

  // Verify it's in custom column
  let issue = await getIssue(page, 101);
  expect(issue.customColumnId).toBe(colId);

  // Reload to ensure state is fresh
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Open column config and delete the column
  await page.click('#column-config-btn');
  await page.waitForSelector('.column-config-item');
  
  // Find and click delete button for our custom column
  const deleteBtn = page.locator(`.column-config-item[data-col-id="${colId}"] .column-config-delete`);
  if (await deleteBtn.isVisible()) {
    page.on('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    await page.waitForTimeout(300);
  }

  // Verify issue moved to todo
  issue = await getIssue(page, 101);
  expect(issue.customColumnId).toBeNull();
  expect(issue.status).toBe('todo');
});

// ===== Multiple Custom Columns =====

test('issues can be in different custom columns', async ({ page }) => {
  const colId1 = await createCustomColumn(page, 'Backlog');
  const colId2 = await createCustomColumn(page, 'In Review');

  // Move issues to different custom columns
  await moveIssueToCustomColumn(page, 101, colId1);
  await moveIssueToCustomColumn(page, 103, colId2);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify each issue is in its respective column
  const cardInCol1 = page.locator(`.column[data-col-id="${colId1}"] .issue-card[data-id="101"]`);
  await expect(cardInCol1).toBeVisible();

  const cardInCol2 = page.locator(`.column[data-col-id="${colId2}"] .issue-card[data-id="103"]`);
  await expect(cardInCol2).toBeVisible();

  // Verify counts
  const count1 = page.locator(`[data-count-for="${colId1}"]`);
  const count2 = page.locator(`[data-count-for="${colId2}"]`);
  await expect(count1).toHaveText('1');
  await expect(count2).toHaveText('1');
});

test('moving issue between custom columns via API', async ({ page }) => {
  const colId1 = await createCustomColumn(page, 'Backlog');
  const colId2 = await createCustomColumn(page, 'In Review');

  // Move issue to first custom column
  await moveIssueToCustomColumn(page, 101, colId1);

  // Verify it's in first custom column
  let issue = await getIssue(page, 101);
  expect(issue.customColumnId).toBe(colId1);

  // Move to second custom column
  await moveIssueToCustomColumn(page, 101, colId2);

  // Verify it moved to second custom column
  issue = await getIssue(page, 101);
  expect(issue.customColumnId).toBe(colId2);
});

// ===== Column Menu Tests =====

test('clear all cards from custom column moves them to To Do', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  // Move two issues to custom column
  await moveIssueToCustomColumn(page, 101, colId);
  await moveIssueToCustomColumn(page, 103, colId);

  // Reload to ensure state is fresh
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify both are in custom column
  const customCards = page.locator(`.column[data-col-id="${colId}"] .issue-card`);
  await expect(customCards).toHaveCount(2);

  // Open column menu and click "Clear all cards"
  const menuBtn = page.locator(`.column[data-col-id="${colId}"] .column-menu-btn`);
  await menuBtn.click();
  
  // Accept the confirmation dialog
  page.on('dialog', dialog => dialog.accept());
  
  const clearBtn = page.locator('button:has-text("Clear all cards")');
  await clearBtn.click();
  await page.waitForTimeout(300);

  // Verify custom column is now empty
  await expect(customCards).toHaveCount(0);

  // Verify cards moved to todo
  const issue1 = await getIssue(page, 101);
  const issue2 = await getIssue(page, 103);
  expect(issue1.customColumnId).toBeNull();
  expect(issue1.status).toBe('todo');
  expect(issue2.customColumnId).toBeNull();
  expect(issue2.status).toBe('todo');
});
