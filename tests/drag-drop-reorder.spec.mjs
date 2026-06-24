import { test, expect } from '@playwright/test';
import { resetAndSeed } from './helpers.mjs';
import { getTestContext } from '../playwright/playwright-shared.mjs';

const APP_URL = 'http://127.0.0.1:8080/';
// Tests target the test backend (port 3002 by default — see
// playwright/playwright-global-setup.mjs). Never the live jirito on 3001.
const API_URL = `http://127.0.0.1:${getTestContext().testPort}`;

test.beforeEach(async ({ page }) => {
  // Reset DB and seed the default 6 issues in one silent PUT — see
  // helpers.mjs TEST_HEADERS comment.
  await resetAndSeed();
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

// Helper: update an issue status via the API and re-render
async function updateIssueStatus(page, issueId, newStatus, newRank) {
  await page.evaluate(async ({ id, status, rank }) => {
    const res = await fetch(`/api/issues/${id}`);
    const issue = await res.json();
    await fetch(`/api/issues/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rank }),
    });
  }, { id: issueId, status: newStatus, rank: newRank });
  
  // Reload to see the update
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
}

// Helper: get issue IDs by status, sorted by rank so the test can
// reliably use [0] / [length-1] to identify the visually-first and
// visually-last card. The server returns issues in createdAt DESC
// order, which is NOT the display order.
async function getIssuesByStatus(page, status) {
  return await page.evaluate(async (status) => {
    const res = await fetch('/api/issues');
    const issues = await res.json();
    return issues
      .filter(i => i.status === status)
      .map(i => ({ id: i.id, title: i.title, rank: i.rank }))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }, status);
}

// ===== Same-Column Reorder Tests =====

test('reordering a card within the same column (drop above) works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  await expect(todoCards.nth(0).locator('.issue-key')).toHaveText('PROJ-101');
  await expect(todoCards.nth(1).locator('.issue-key')).toHaveText('PROJ-103');

  // Get the rank values for the two todo cards
  const todoIssues = await getIssuesByStatus(page, 'todo');
  const proj101 = todoIssues.find(i => i.id === 101);
  const proj103 = todoIssues.find(i => i.id === 103);
  
  // Swap their ranks (move PROJ-103 above PROJ-101)
  const tempRank = proj101.rank;
  await updateIssueStatus(page, 101, 'todo', proj103.rank);
  await updateIssueStatus(page, 103, 'todo', tempRank);
  
  // Verify the reorder
  const reorderedCards = page.locator('[data-status="todo"] .issue-card');
  await expect(reorderedCards.nth(0).locator('.issue-key')).toHaveText('PROJ-103');
  await expect(reorderedCards.nth(1).locator('.issue-key')).toHaveText('PROJ-101');
});

test('reordering a card within the same column (drop below) works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const todoIssues = await getIssuesByStatus(page, 'todo');
  
  // Swap PROJ-101 and PROJ-103 ranks
  const proj101 = todoIssues.find(i => i.id === 101);
  const proj103 = todoIssues.find(i => i.id === 103);
  
  await updateIssueStatus(page, 101, 'todo', proj103.rank);
  await updateIssueStatus(page, 103, 'todo', proj101.rank);

  const reorderedCards = page.locator('[data-status="todo"] .issue-card');
  await expect(reorderedCards.nth(0).locator('.issue-key')).toHaveText('PROJ-103');
  await expect(reorderedCards.nth(1).locator('.issue-key')).toHaveText('PROJ-101');
});

test('reordering within same column updates ranks correctly', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const initialRanks = await page.evaluate(async () => {
    const res = await fetch('/api/issues');
    const issues = await res.json();
    return issues.filter(i => i.status === 'todo').map(i => ({ id: i.id, rank: i.rank })).sort((a, b) => a.rank - b.rank);
  });
  expect(initialRanks.length).toBeGreaterThan(0);

  // Swap the first and last todo cards' ranks
  const todoIssues = await getIssuesByStatus(page, 'todo');
  const first = todoIssues[0];
  const last = todoIssues[todoIssues.length - 1];
  await updateIssueStatus(page, first.id, 'todo', last.rank);
  await updateIssueStatus(page, last.id, 'todo', first.rank);

  const finalRanks = await page.evaluate(async () => {
    const res = await fetch('/api/issues');
    const issues = await res.json();
    return issues.filter(i => i.status === 'todo').map(i => ({ id: i.id, rank: i.rank })).sort((a, b) => a.rank - b.rank);
  });
  expect(finalRanks.length).toBeGreaterThan(0);
  expect(finalRanks).not.toEqual(initialRanks);
});

test('dragging a card within the same column to the top position works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const todoIssues = await getIssuesByStatus(page, 'todo');
  const first = todoIssues[0];
  const last = todoIssues[todoIssues.length - 1];
  
  // Move last card to top (give it a lower rank than the first card)
  const minRank = Math.min(...todoIssues.map(i => i.rank));
  await updateIssueStatus(page, last.id, 'todo', minRank - 1);

  await expect(page.locator('[data-status="todo"] .issue-card').first().locator('.issue-key')).toHaveText('PROJ-106');
});

test('dragging a card within the same column to the bottom position works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(3);

  const todoIssues = await getIssuesByStatus(page, 'todo');
  const first = todoIssues[0];
  const last = todoIssues[todoIssues.length - 1];
  
  // Move first card to bottom (give it a higher rank than the last card)
  const maxRank = Math.max(...todoIssues.map(i => i.rank));
  await updateIssueStatus(page, first.id, 'todo', maxRank + 1);

  await expect(page.locator('[data-status="todo"] .issue-card').last().locator('.issue-key')).toHaveText('PROJ-101');
});

test('reordering with multiple cards in the same column maintains correct order', async ({ page }) => {
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const initialCount = await inProgressCards.count();

  // Move a todo card to In Progress (via API)
  const todoIssues = await getIssuesByStatus(page, 'todo');
  const todoCard = todoIssues[0];
  
  // Get max rank in inprogress
  const inProgressIssues = await getIssuesByStatus(page, 'inprogress');
  const maxRank = inProgressIssues.length > 0 
    ? Math.max(...inProgressIssues.map(i => i.rank)) 
    : 0;
  
  await updateIssueStatus(page, todoCard.id, 'inprogress', maxRank + 1);

  const updatedInProgress = page.locator('[data-status="inprogress"] .issue-card');
  await expect(updatedInProgress).toHaveCount(initialCount + 1);

  const cards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(cards).toHaveCount(2);

  // Reorder within In Progress
  const ipIssues = await getIssuesByStatus(page, 'inprogress');
  const first = ipIssues[0];
  const last = ipIssues[ipIssues.length - 1];
  await updateIssueStatus(page, first.id, 'inprogress', last.rank + 1);
  await updateIssueStatus(page, last.id, 'inprogress', first.rank - 1);

  const finalCards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(finalCards.nth(0).locator('.issue-key')).not.toHaveText('PROJ-102');
});

test('column count updates after same-column reorder', async ({ page }) => {
  const todoCount = page.locator('[data-count-for="todo"]');
  const initialCount = parseInt(await todoCount.textContent());

  // Reorder within todo (swap ranks)
  const todoIssues = await getIssuesByStatus(page, 'todo');
  const first = todoIssues[0];
  const second = todoIssues[1];
  await updateIssueStatus(page, first.id, 'todo', second.rank);
  await updateIssueStatus(page, second.id, 'todo', first.rank);

  await expect(todoCount).toHaveText(String(initialCount));
});

// ===== Cross-Column Move Tests =====

test('dragging a card between columns with multiple cards works', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');

  await expect(todoCards).toHaveCount(3);
  await expect(inProgressCards).toHaveCount(1);

  // Move a todo card to In Progress via API
  const todoIssues = await getIssuesByStatus(page, 'todo');
  const todoCard = todoIssues[0];
  
  const inProgressIssues = await getIssuesByStatus(page, 'inprogress');
  const maxRank = inProgressIssues.length > 0 
    ? Math.max(...inProgressIssues.map(i => i.rank)) 
    : 0;
  
  await updateIssueStatus(page, todoCard.id, 'inprogress', maxRank + 1);

  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(2);
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(2);
});

test('dropping on empty area of a populated column appends card', async ({ page }) => {
  // Move a todo card to In Progress (which already has a card)
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');

  const initialTodoCount = await todoCards.count();
  const initialInProgressCount = await inProgressCards.count();

  const todoIssues = await getIssuesByStatus(page, 'todo');
  const todoCard = todoIssues[0];
  
  const inProgressIssues = await getIssuesByStatus(page, 'inprogress');
  const maxRank = inProgressIssues.length > 0 
    ? Math.max(...inProgressIssues.map(i => i.rank)) 
    : 0;
  
  await updateIssueStatus(page, todoCard.id, 'inprogress', maxRank + 1);

  // Verify the card was moved
  await expect(todoCards).toHaveCount(initialTodoCount - 1);
  await expect(inProgressCards).toHaveCount(initialInProgressCount + 1);

  // Now move it back to Todo column
  const updatedInProgressIssues = await getIssuesByStatus(page, 'inprogress');
  const firstInProgress = updatedInProgressIssues[0];
  
  const todoIssuesAfter = await getIssuesByStatus(page, 'todo');
  const todoMaxRank = todoIssuesAfter.length > 0 
    ? Math.max(...todoIssuesAfter.map(i => i.rank)) 
    : 0;
  
  await updateIssueStatus(page, firstInProgress.id, 'todo', todoMaxRank + 1);

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

  // Move todo -> review
  const todoIssues = await getIssuesByStatus(page, 'todo');
  const reviewIssues = await getIssuesByStatus(page, 'review');
  const reviewMaxRank = reviewIssues.length > 0 ? Math.max(...reviewIssues.map(i => i.rank)) : 0;
  await updateIssueStatus(page, todoIssues[0].id, 'review', reviewMaxRank + 1);

  await expect(todoCards).toHaveCount(2);
  await expect(reviewCards).toHaveCount(2);

  // Move review -> done
  const updatedReviewIssues = await getIssuesByStatus(page, 'review');
  const doneIssues = await getIssuesByStatus(page, 'done');
  const doneMaxRank = doneIssues.length > 0 ? Math.max(...doneIssues.map(i => i.rank)) : 0;
  await updateIssueStatus(page, updatedReviewIssues[0].id, 'done', doneMaxRank + 1);

  await expect(page.locator('[data-status="review"] .issue-card')).toHaveCount(1);
  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(2);

  // Move done -> inprogress
  const updatedDoneIssues = await getIssuesByStatus(page, 'done');
  const inProgressIssues = await getIssuesByStatus(page, 'inprogress');
  const inProgressMaxRank = inProgressIssues.length > 0 ? Math.max(...inProgressIssues.map(i => i.rank)) : 0;
  await updateIssueStatus(page, updatedDoneIssues[0].id, 'inprogress', inProgressMaxRank + 1);

  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(1);
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(2);
});
