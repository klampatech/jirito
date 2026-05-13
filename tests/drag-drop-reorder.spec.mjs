import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '..', 'index.html');

async function clearStorage(page) {
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {}
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
  await page.goto('file://' + indexPath);
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
});

// ===== Same-Column Reorder Tests =====

test('reordering a card within the same column (drop above) works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  await expect(todoCards.nth(0).locator('.issue-key')).toHaveText('PROJ-101');
  await expect(todoCards.nth(1).locator('.issue-key')).toHaveText('PROJ-103');

  const firstCard = todoCards.first();
  const firstTitle = firstCard.locator('.issue-title');
  const firstTitleBox = await firstTitle.boundingBox();
  
  await todoCards.nth(1).dragTo(firstTitle, {
    targetPosition: { x: firstTitleBox.width / 2, y: -5 },
    timeout: 10000
  });

  const reorderedCards = page.locator('[data-status="todo"] .issue-card');
  await expect(reorderedCards.nth(0).locator('.issue-key')).toHaveText('PROJ-103');
  await expect(reorderedCards.nth(1).locator('.issue-key')).toHaveText('PROJ-101');
});

test('reordering a card within the same column (drop below) works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const secondCard = todoCards.nth(1);
  const secondTitle = secondCard.locator('.issue-title');
  const secondTitleBox = await secondTitle.boundingBox();

  await todoCards.first().dragTo(secondTitle, {
    targetPosition: { x: secondTitleBox.width / 2, y: secondTitleBox.height + 5 },
    timeout: 10000
  });

  const reorderedCards = page.locator('[data-status="todo"] .issue-card');
  await expect(reorderedCards.nth(0).locator('.issue-key')).toHaveText('PROJ-103');
  await expect(reorderedCards.nth(1).locator('.issue-key')).toHaveText('PROJ-101');
});

test('reordering within same column updates ranks correctly', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const initialRanks = await page.evaluate(() => {
    return getIssues().filter(i => i.status === 'todo').map(i => ({ id: i.id, rank: i.rank })).sort((a, b) => a.rank - b.rank);
  });
  expect(initialRanks.length).toBeGreaterThan(0);

  const lastCard = todoCards.last();
  const lastTitle = lastCard.locator('.issue-title');
  const lastTitleBox = await lastTitle.boundingBox();

  await todoCards.first().dragTo(lastTitle, {
    targetPosition: { x: lastTitleBox.width / 2, y: lastTitleBox.height + 5 },
    timeout: 10000
  });

  const finalRanks = await page.evaluate(() => {
    return getIssues().filter(i => i.status === 'todo').map(i => ({ id: i.id, rank: i.rank })).sort((a, b) => a.rank - b.rank);
  });
  expect(finalRanks.length).toBeGreaterThan(0);
  expect(finalRanks).not.toEqual(initialRanks);
});

test('dragging a card within the same column to the top position works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const firstCard = todoCards.first();
  const firstTitle = firstCard.locator('.issue-title');

  await todoCards.last().dragTo(firstTitle, {
    targetPosition: { x: 50, y: -5 },
    timeout: 10000
  });

  await expect(page.locator('[data-status="todo"] .issue-card').first().locator('.issue-key')).toHaveText('PROJ-106');
});

test('dragging a card within the same column to the bottom position works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const lastCard = todoCards.last();
  const lastTitle = lastCard.locator('.issue-title');
  const lastTitleBox = await lastTitle.boundingBox();

  await todoCards.first().dragTo(lastTitle, {
    targetPosition: { x: lastTitleBox.width / 2, y: lastTitleBox.height + 5 },
    timeout: 10000
  });

  await expect(page.locator('[data-status="todo"] .issue-card').last().locator('.issue-key')).toHaveText('PROJ-101');
});

test('reordering with multiple cards in the same column maintains correct order', async ({ page }) => {
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const initialCount = await inProgressCards.count();

  const todoCard = page.locator('[data-status="todo"] .issue-card').first();
  const inProgressCol = page.locator('[data-status="inprogress"] .column-body');
  await todoCard.dragTo(inProgressCol, { timeout: 10000 });

  const updatedInProgress = page.locator('[data-status="inprogress"] .issue-card');
  await expect(updatedInProgress).toHaveCount(initialCount + 1);

  const cards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(cards).toHaveCount(2);

  const secondCard = cards.nth(1);
  const secondTitle = secondCard.locator('.issue-title');
  const secondTitleBox = await secondTitle.boundingBox();

  await cards.nth(0).dragTo(secondTitle, {
    targetPosition: { x: secondTitleBox.width / 2, y: secondTitleBox.height + 5 },
    timeout: 10000
  });

  const finalCards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(finalCards.nth(0).locator('.issue-key')).not.toHaveText('PROJ-102');
});

test('column count updates after same-column reorder', async ({ page }) => {
  const todoCount = page.locator('[data-count-for="todo"]');
  const initialCount = parseInt(await todoCount.textContent());

  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();
  const firstTitle = firstCard.locator('.issue-title');

  await todoCards.nth(1).dragTo(firstTitle, {
    targetPosition: { x: 50, y: -5 },
    timeout: 10000
  });

  await expect(todoCount).toHaveText(String(initialCount));
});

test('dragging a card between columns with multiple cards works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const inProgressCol = page.locator('[data-status="inprogress"] .column-body');

  await expect(todoCards).toHaveCount(3);
  await expect(inProgressCards).toHaveCount(1);

  const source = todoCards.first();
  await source.dragTo(inProgressCol, { timeout: 10000 });

  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(2);
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(2);
});

test('dropping on empty area of a populated column appends card', async ({ page }) => {
  // Move a todo card to In Progress (which already has a card)
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const inProgressCol = page.locator('[data-status="inprogress"] .column-body');

  const initialTodoCount = await todoCards.count();
  const initialInProgressCount = await inProgressCards.count();
  
  const todoCard = todoCards.first();
  await todoCard.dragTo(inProgressCol, { timeout: 10000 });

  // Verify the card was moved
  await expect(todoCards).toHaveCount(initialTodoCount - 1);
  await expect(inProgressCards).toHaveCount(initialInProgressCount + 1);

  // Now move it back to Todo column (which already has cards)
  const updatedInProgress = page.locator('[data-status="inprogress"] .issue-card').first();
  const todoCol = page.locator('[data-status="todo"] .column-body');
  await updatedInProgress.dragTo(todoCol, { timeout: 10000 });

  // Verify it was moved back to Todo (back to original count)
  const finalTodoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(finalTodoCards).toHaveCount(initialTodoCount);
  const finalInProgress = page.locator('[data-status="inprogress"] .issue-card');
  await expect(finalInProgress).toHaveCount(initialInProgressCount);
});

test('reordering cards across all four columns works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const reviewCards = page.locator('[data-status="review"] .issue-card');
  const doneCards = page.locator('[data-status="done"] .issue-card');

  await expect(todoCards).toHaveCount(3);
  await expect(inProgressCards).toHaveCount(1);
  await expect(reviewCards).toHaveCount(1);
  await expect(doneCards).toHaveCount(1);

  const todoCard = todoCards.first();
  const reviewCol = page.locator('[data-status="review"] .column-body');
  await todoCard.dragTo(reviewCol, { timeout: 10000 });

  await expect(todoCards).toHaveCount(2);
  await expect(reviewCards).toHaveCount(2);

  const reviewCard = page.locator('[data-status="review"] .issue-card').first();
  const doneCol = page.locator('[data-status="done"] .column-body');
  await reviewCard.dragTo(doneCol, { timeout: 10000 });

  await expect(page.locator('[data-status="review"] .issue-card')).toHaveCount(1);
  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(2);

  const doneCard = page.locator('[data-status="done"] .issue-card').first();
  const inProgressCol = page.locator('[data-status="inprogress"] .column-body');
  await doneCard.dragTo(inProgressCol, { timeout: 10000 });

  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(1);
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(2);
});
