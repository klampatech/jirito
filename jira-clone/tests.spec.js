const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('file:///Users/kylelampa/Development/little-coder/jira-clone/index.html');
});

// ===== Layout Tests =====
test('renders 4 columns', async ({ page }) => {
  const columns = page.locator('.column');
  await expect(columns).toHaveCount(4);
});

test('column headers have correct labels', async ({ page }) => {
  const headers = page.locator('.column-title span:nth-child(2)');
  await expect(headers.nth(0)).toHaveText('To Do');
  await expect(headers.nth(1)).toHaveText('In Progress');
  await expect(headers.nth(2)).toHaveText('In Review');
  await expect(headers.nth(3)).toHaveText('Done');
});

test('column counts show correct numbers', async ({ page }) => {
  const counts = page.locator('.count');
  await expect(counts.nth(0)).toHaveText('3');  // To Do: 3 issues
  await expect(counts.nth(1)).toHaveText('1');  // In Progress: 1
  await expect(counts.nth(2)).toHaveText('1');  // In Review: 1
  await expect(counts.nth(3)).toHaveText('1');  // Done: 1
});

// ===== Issue Card Tests =====
test('renders sample issue cards', async ({ page }) => {
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(6);
});

test('issue cards show correct keys', async ({ page }) => {
  const keys = page.locator('.issue-key');
  await expect(keys.nth(0)).toHaveText('PROJ-101');
  await expect(keys.nth(1)).toHaveText('PROJ-102');
});

test('issue cards show type icons', async ({ page }) => {
  const icons = page.locator('.issue-type-icon');
  await expect(icons.nth(0)).toHaveText('📖');  // story
  await expect(icons.nth(1)).toHaveText('🐛');  // bug
});

test('issue cards show priority badges', async ({ page }) => {
  const priorities = page.locator('.issue-priority');
  await expect(priorities.nth(0)).toHaveText('high');
  await expect(priorities.nth(1)).toHaveText('high');
});

test('issue cards show assignee avatars', async ({ page }) => {
  const avatars = page.locator('.issue-assignee');
  await expect(avatars).toHaveCount(5);  // 5 of 6 have assignees
});

// ===== Create Issue Tests =====
test('create button opens modal', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await expect(page.locator('#modal-overlay')).toBeVisible();
});

test('modal close button works', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#modal-close').click();
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
});

test('cancel button closes modal', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#modal-cancel').click();
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
});

test('clicking overlay background closes modal', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#modal-overlay').click();
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
});

test('can create a new issue', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Test issue');
  await page.locator('#issue-desc').fill('Test description');
  await page.locator('#issue-type').selectOption('bug');
  await page.locator('#issue-priority').selectOption('high');
  await page.locator('#issue-assignee').fill('Tester');
  await page.locator('#issue-form').submit();

  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(7);

  // Check the new card appears in To Do
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(4);
  await expect(todoCards.last()).toContainText('Test issue');
});

// ===== Drag and Drop Tests =====
test('cards are draggable', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await expect(card).toHaveAttribute('draggable', 'true');
});

test('dragging a card to In Progress updates its status', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  const cardId = await card.getAttribute('data-id');
  const title = await card.locator('.issue-title').textContent();

  const todoCount = page.locator('[data-status="todo"] .issue-card').count();
  const inProgressCount = page.locator('[data-status="inprogress"] .issue-card').count();

  // Drag to In Progress column
  const source = page.locator('[data-status="todo"] .issue-card').first();
  const target = page.locator('[data-status="inprogress"] .column-body');
  await source.dragTo(target);

  // Verify card moved
  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(await todoCount - 1);
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(await inProgressCount + 1);

  // Verify count badges updated
  const inProgressCountBadge = page.locator('[data-count-for="inprogress"]');
  await expect(inProgressCountBadge).toHaveText(String(await inProgressCount + 1));
});

test('dragging a card to Done updates its status', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  const target = page.locator('[data-status="done"] .column-body');
  await card.dragTo(target);

  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(2);
});

// ===== Search Tests =====
test('search input exists', async ({ page }) => {
  const search = page.locator('.search-input');
  await expect(search).toBeVisible();
});

// ===== Nav Tests =====
test('top nav displays project name', async ({ page }) => {
  await expect(page.locator('.project-name')).toHaveText('Project Alpha');
});

test('avatar is visible', async ({ page }) => {
  await expect(page.locator('.avatar')).toHaveText('K');
});
