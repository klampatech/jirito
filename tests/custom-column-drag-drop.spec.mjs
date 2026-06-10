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

// Helper: Create a custom column via the API
async function createCustomColumn(page, name, color = '#9E9E9E') {
  const colId = await page.evaluate(async ({ name, color }) => {
    // Use the app's addCustomColumn function if available
    if (typeof window.addCustomColumn === 'function') {
      return window.addCustomColumn(name, color);
    }
    // Otherwise, create via state manipulation
    const state = await window.storage.getStorageData();
    const columns = state.columns || [];
    const id = 'col-' + Date.now();
    columns.push({ id, name, color, status: null, order: columns.length });
    state.columns = columns;
    await window.storage.saveStorageData(state);
    return id;
  }, { name, color });
  return colId;
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

// Helper: Get issue details
async function getIssue(page, issueId) {
  return await page.evaluate(async (id) => {
    const res = await fetch(`/api/issues/${id}`);
    return res.json();
  }, issueId);
}

// ===== Custom Column Creation Tests =====

test('custom column appears in the board', async ({ page }) => {
  // Create a custom column
  const colId = await createCustomColumn(page, 'Backlog');

  // Reload to see the new column
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

// ===== Drag to Custom Column Tests =====

test('dragging an issue to a custom column sets customColumnId', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Get the first todo card
  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const cardId = await todoCard.getAttribute('data-id');

  // Drag to custom column
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);
  await todoCard.dragTo(customColBody);

  // Verify the issue now has customColumnId set
  const issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId);
  // Status should be unchanged (still 'todo' or whatever it was)
  expect(issue.status).toBeTruthy();
});

test('dragging an issue to a custom column updates the count', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Initial count should be 0
  const countEl = page.locator(`[data-count-for="${colId}"]`);
  await expect(countEl).toHaveText('0');

  // Drag a card to custom column
  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);
  await todoCard.dragTo(customColBody);

  // Count should now be 1
  await expect(countEl).toHaveText('1');
});

// ===== Drag from Custom Column Tests =====

test('dragging an issue from custom column to status column sets status and clears customColumnId', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // First, move an issue to the custom column
  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const cardId = await todoCard.getAttribute('data-id');
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);
  await todoCard.dragTo(customColBody);

  // Verify it's in the custom column
  let issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId);

  // Now drag it back to the 'inprogress' column
  const cardInCustomCol = page.locator(`.column[data-col-id="${colId}"] .issue-card`).first();
  const inprogressColBody = page.locator('[data-status="inprogress"] .column-body');
  await cardInCustomCol.dragTo(inprogressColBody);

  // Verify status changed and customColumnId cleared
  issue = await getIssue(page, cardId);
  expect(issue.status).toBe('inprogress');
  expect(issue.customColumnId).toBeNull();
});

// ===== Reorder within Custom Column =====

test('reordering within a custom column works', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Move two issues to the custom column
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();
  const secondCard = todoCards.nth(1);
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);

  await firstCard.dragTo(customColBody);
  await page.waitForTimeout(200); // Wait for state save
  await secondCard.dragTo(customColBody);
  await page.waitForTimeout(200);

  // Verify both are in the custom column
  const customCards = page.locator(`.column[data-col-id="${colId}"] .issue-card`);
  await expect(customCards).toHaveCount(2);

  // Get the IDs
  const firstId = await customCards.first().getAttribute('data-id');
  const secondId = await customCards.nth(1).getAttribute('data-id');

  // Reorder: drag second card above first
  await customCards.nth(1).dragTo(customCards.first());

  // Verify order changed
  const reorderedCards = page.locator(`.column[data-col-id="${colId}"] .issue-card`);
  const newFirstId = await reorderedCards.first().getAttribute('data-id');
  expect(newFirstId).toBe(secondId);
});

// ===== Move between Custom Columns =====

test('dragging between two custom columns updates customColumnId', async ({ page }) => {
  const colId1 = await createCustomColumn(page, 'Backlog');
  const colId2 = await createCustomColumn(page, 'In Review');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Move an issue to first custom column
  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const cardId = await todoCard.getAttribute('data-id');
  const customCol1Body = page.locator(`.column[data-col-id="${colId1}"] .column-body`);
  await todoCard.dragTo(customCol1Body);

  // Verify it's in first custom column
  let issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId1);

  // Move to second custom column
  const cardInCol1 = page.locator(`.column[data-col-id="${colId1}"] .issue-card`).first();
  const customCol2Body = page.locator(`.column[data-col-id="${colId2}"] .column-body`);
  await cardInCol1.dragTo(customCol2Body);

  // Verify it moved to second custom column
  issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId2);
});

// ===== Undo Tests =====

test('undo restores issue to original column after drag to custom column', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Get initial status
  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const cardId = await todoCard.getAttribute('data-id');
  const originalIssue = await getIssue(page, cardId);
  const originalStatus = originalIssue.status;

  // Drag to custom column
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);
  await todoCard.dragTo(customColBody);

  // Verify moved
  let issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId);

  // Click undo button
  const undoButton = page.locator('button:has-text("Undo")');
  if (await undoButton.isVisible()) {
    await undoButton.click();
    await page.waitForTimeout(200);
  }

  // Verify restored
  issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBeNull();
  expect(issue.status).toBe(originalStatus);
});

// ===== Persistence Tests =====

test('customColumnId persists across page reload', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Move an issue to custom column
  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const cardId = await todoCard.getAttribute('data-id');
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);
  await todoCard.dragTo(customColBody);
  await page.waitForTimeout(500); // Wait for debounced save

  // Verify it's in custom column
  let issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId);

  // Reload the page
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify customColumnId persisted
  issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId);

  // Verify card still appears in custom column
  const cardInCustomCol = page.locator(`.column[data-col-id="${colId}"] .issue-card[data-id="${cardId}"]`);
  await expect(cardInCustomCol).toBeVisible();
});

// ===== Column Menu Tests =====

test('clear all cards from custom column moves them to To Do', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Move two issues to custom column
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCardId = await todoCards.first().getAttribute('data-id');
  const secondCardId = await todoCards.nth(1).getAttribute('data-id');
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);

  await todoCards.first().dragTo(customColBody);
  await page.waitForTimeout(200);
  await page.locator('[data-status="todo"] .issue-card').first().dragTo(customColBody);
  await page.waitForTimeout(200);

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
  const issue1 = await getIssue(page, firstCardId);
  const issue2 = await getIssue(page, secondCardId);
  expect(issue1.customColumnId).toBeNull();
  expect(issue1.status).toBe('todo');
  expect(issue2.customColumnId).toBeNull();
  expect(issue2.status).toBe('todo');
});

// ===== Column Delete Tests =====

test('deleting a custom column moves cards to To Do', async ({ page }) => {
  const colId = await createCustomColumn(page, 'Backlog');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Move an issue to custom column
  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const cardId = await todoCard.getAttribute('data-id');
  const customColBody = page.locator(`.column[data-col-id="${colId}"] .column-body`);
  await todoCard.dragTo(customColBody);

  // Verify it's in custom column
  let issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBe(colId);

  // Open column config and delete the column
  await page.click('#column-config-btn');
  await page.waitForSelector('.column-config-item');
  
  // Find and click delete button for our custom column
  const deleteBtn = page.locator(`.column-config-item[data-col-id="${colId}"] .column-config-delete`);
  if (await deleteBtn.isVisible()) {
    page.on('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    await page.waitForTimeout(200);
  }

  // Verify issue moved to todo
  issue = await getIssue(page, cardId);
  expect(issue.customColumnId).toBeNull();
  expect(issue.status).toBe('todo');
});
