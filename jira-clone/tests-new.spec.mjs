import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('file:///Users/kylelampa/Development/little-coder/jira-clone/index.html');
});

// ===== Detail Panel Tests =====
test('clicking a card opens detail panel', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-panel')).toHaveClass(/open/);
});

test('detail panel shows issue title', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-title')).toContainText('PROJ-101');
});

test('detail panel shows issue type', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-body')).toContainText('Story');
});

test('detail panel shows issue priority', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-body')).toContainText('High');
});

test('detail panel shows assignee', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-assignee')).toHaveValue('Alice');
});

test('detail panel shows description', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-body')).toContainText('Create wireframes');
});

test('detail panel close button works', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await page.locator('#detail-close').click();
  await expect(page.locator('#detail-panel')).not.toHaveClass(/open/);
});

test('changing priority in detail panel updates the card', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await page.locator('#detail-priority').selectOption('low');
  await page.locator('#detail-body').locator('#detail-priority').evaluate(el => el.dispatchEvent(new Event('change')));
  await page.locator('#detail-close').click();
  // Card should now show low priority
  const updatedCard = page.locator('[data-status="todo"] .issue-card').first();
  await expect(updatedCard.locator('.issue-priority')).toHaveText('low');
});

test('status buttons in detail panel change issue status', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const inProgressBtn = page.locator('.detail-status-btn').nth(1);
  await inProgressBtn.click();
  await page.locator('#detail-close').click();
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(2);
  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(2);
});

test('editing summary in detail panel updates the card', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await page.locator('#detail-summary').fill('Updated title');
  await page.locator('#detail-summary').blur();
  await page.waitForTimeout(100);
  await page.locator('#detail-close').click();
  const updatedCard = page.locator('[data-status="todo"] .issue-card').first();
  await expect(updatedCard.locator('.issue-title')).toContainText('Updated title');
});

// ===== Comments Tests =====
test('detail panel shows comments section', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-body')).toContainText('Comments');
});

test('can add a comment to an issue', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await page.locator('#comment-input').fill('This is a test comment');
  await page.locator('#comment-submit').click();
  await expect(page.locator('#detail-body')).toContainText('This is a test comment');
});

test('comment count badge appears on card', async ({ page }) => {
  // Clear localStorage first for isolation
  await page.evaluate(() => localStorage.removeItem('jira-clone-comments'));
  await page.reload();
  await page.waitForTimeout(300);

  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await page.locator('#comment-input').fill('First comment');
  await page.locator('#comment-submit').click();
  await page.locator('#detail-close').click();
  await page.waitForTimeout(200);
  const updatedCard = page.locator('[data-status="todo"] .issue-card').first();
  await expect(updatedCard.locator('.issue-comments-badge')).toBeVisible();
  await expect(updatedCard.locator('.issue-comments-badge')).toContainText('1');
});

// ===== Filter Tests =====
test('filter by type shows only matching issues', async ({ page }) => {
  await page.reload();
  await page.waitForTimeout(300);
  await page.locator('#filter-type').selectOption('bug');
  await page.locator('#filter-type').evaluate(el => el.dispatchEvent(new Event('change')));
  const allCards = page.locator('.issue-card');
  await expect(allCards).toHaveCount(1);
  await expect(allCards.first().locator('.issue-key')).toContainText('102');
});

test('filter by priority shows only matching issues', async ({ page }) => {
  await page.reload();
  await page.waitForTimeout(300);
  await page.locator('#filter-priority').selectOption('high');
  await page.locator('#filter-priority').evaluate(el => el.dispatchEvent(new Event('change')));
  const allCards = page.locator('.issue-card');
  await expect(allCards).toHaveCount(2);
});

test('filter by assignee shows only matching issues', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);
  await page.locator('#filter-assignee').selectOption('Alice');
  await page.locator('#filter-assignee').evaluate(el => el.dispatchEvent(new Event('change')));
  const allCards = page.locator('.issue-card');
  await expect(allCards).toHaveCount(2);
});

test('search filters by text', async ({ page }) => {
  await page.reload();
  await page.waitForTimeout(300);
  await page.locator('#search-input').fill('login');
  await page.waitForTimeout(100);
  const allCards = page.locator('.issue-card');
  await expect(allCards).toHaveCount(1);
  await expect(allCards.first().locator('.issue-title')).toContainText('Design login page mockup');
});

test('no results shows message', async ({ page }) => {
  await page.reload();
  await page.waitForTimeout(300);
  await page.locator('#search-input').fill('nonexistent');
  await expect(page.locator('.no-results').first()).toBeVisible();
});

test('clearing filters shows all issues', async ({ page }) => {
  await page.reload();
  await page.waitForTimeout(300);
  await page.locator('#filter-type').selectOption('bug');
  await page.locator('#filter-type').evaluate(el => el.dispatchEvent(new Event('change')));
  await expect(page.locator('.issue-card')).toHaveCount(1);
  await page.locator('#filter-type').selectOption('all');
  await page.locator('#filter-type').evaluate(el => el.dispatchEvent(new Event('change')));
  await expect(page.locator('.issue-card')).toHaveCount(6);
});

// ===== localStorage Tests =====
test('created issues persist after reload', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Persisted issue');
  await page.locator('#issue-desc').fill('Should survive reload');
  await page.locator('#issue-type').selectOption('task');
  await page.locator('#issue-priority').selectOption('medium');
  await page.locator('#issue-assignee').fill('Tester');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());

  await expect(page.locator('.issue-card')).toHaveCount(7);

  // Reset filters before reload
  await page.locator('#filter-type').selectOption('all');
  await page.locator('#filter-priority').selectOption('all');
  await page.locator('#filter-assignee').selectOption('all');
  await page.locator('#search-input').fill('');

  // Reload and verify
  await page.reload();
  await page.waitForTimeout(300);
  await expect(page.locator('.issue-card')).toHaveCount(7);
  await expect(page.locator('.issue-card').nth(3)).toContainText('Persisted issue');
});

test('dragged issues persist after reload', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);

  const card = page.locator('[data-status="todo"] .issue-card').first();
  const target = page.locator('[data-status="done"] .column-body');
  await target.scrollIntoViewIfNeeded();
  await card.dragTo(target);
  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(2);

  // Reload and verify
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);
  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(1);
});
