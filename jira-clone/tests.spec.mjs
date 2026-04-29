import { test, expect } from '@playwright/test';

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
  await expect(counts.nth(0)).toHaveText('3');
  await expect(counts.nth(1)).toHaveText('1');
  await expect(counts.nth(2)).toHaveText('1');
  await expect(counts.nth(3)).toHaveText('1');
});

// ===== Issue Card Tests =====
test('renders sample issue cards', async ({ page }) => {
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(6);
});

test('issue cards show correct keys', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards.nth(0).locator('.issue-key')).toHaveText('PROJ-101');
  await expect(todoCards.nth(1).locator('.issue-key')).toHaveText('PROJ-103');
});

test('issue cards show type icons', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards.nth(0).locator('.issue-type-icon')).toHaveText('📖');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(inProgressCards.nth(0).locator('.issue-type-icon')).toHaveText('🐛');
});

test('issue cards show priority badges', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards.nth(0).locator('.issue-priority')).toHaveText('high');
  await expect(todoCards.nth(1).locator('.issue-priority')).toHaveText('medium');
});

test('issue cards show assignee avatars', async ({ page }) => {
  const avatars = page.locator('.issue-assignee');
  await expect(avatars).toHaveCount(6);
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
  // Click top-left corner (outside the centered modal)
  await page.mouse.click(10, 10);
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
});

test('can create a new issue', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Test issue');
  await page.locator('#issue-desc').fill('Test description');
  await page.locator('#issue-type').selectOption('bug');
  await page.locator('#issue-priority').selectOption('high');
  await page.locator('#issue-assignee').fill('Tester');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());

  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(7);

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
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');

  const todoCount = await todoCards.count();
  const inProgressCount = await inProgressCards.count();

  const source = page.locator('[data-status="todo"] .issue-card').first();
  const target = page.locator('[data-status="inprogress"] .column-body');
  await source.dragTo(target);

  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(todoCount - 1);
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(inProgressCount + 1);

  const inProgressCountBadge = page.locator('[data-count-for="inprogress"]');
  await expect(inProgressCountBadge).toHaveText(String(inProgressCount + 1));
});

test('dragging a card to Done updates its status', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  const target = page.locator('[data-status="done"] .column-body');
  await target.scrollIntoViewIfNeeded();
  await card.dragTo(target, { timeout: 10000 });
  await page.waitForTimeout(200);

  const doneCards = page.locator('[data-status="done"] .issue-card');
  await expect(doneCards).toHaveCount(2);
});

// ===== Search Tests =====
test('search input exists', async ({ page }) => {
  const search = page.locator('.search-input');
  await expect(search).toBeVisible();
});

// ===== Nav Tests =====
test('top nav displays project name', async ({ page }) => {
  await expect(page.locator('.topnav .project-name')).toHaveText('Project Alpha');
});

test('avatar is visible', async ({ page }) => {
  await expect(page.locator('.avatar')).toHaveText('K');
});

// ===== Sidebar Layout Tests =====
test('sidebar is visible and positioned beside the board', async ({ page }) => {
  const sidebar = page.locator('#sidebar');
  await expect(sidebar).toBeVisible();
  const sidebarBox = await sidebar.boundingBox();
  const board = page.locator('#board');
  const boardBox = await board.boundingBox();
  // Sidebar should be to the left of the board (smaller x)
  expect(sidebarBox.x).toBeLessThanOrEqual(boardBox.x);
});

test('sidebar toggle button hides the sidebar', async ({ page }) => {
  const sidebar = page.locator('#sidebar');
  const toggleBtn = page.locator('#toggle-sidebar');
  await expect(sidebar).toBeVisible();
  await toggleBtn.click();
  await page.waitForTimeout(300);
  await expect(sidebar).not.toBeVisible();
});

test('sidebar toggle button shows the sidebar again', async ({ page }) => {
  const sidebar = page.locator('#sidebar');
  const toggleBtn = page.locator('#toggle-sidebar');
  await toggleBtn.click();
  await page.waitForTimeout(300);
  await expect(sidebar).not.toBeVisible();
  await toggleBtn.click();
  await page.waitForTimeout(300);
  await expect(sidebar).toBeVisible();
});

// ===== Column Menu Tests =====
test('column header has a menu button', async ({ page }) => {
  const menuButtons = page.locator('.column-header .btn-icon');
  await expect(menuButtons).toHaveCount(4);
});

test('clicking column menu button opens menu', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  const menu = page.locator('.column-menu');
  await expect(menu).toBeVisible();
});

test('column menu has rename option', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu-item').first()).toContainText('Rename column');
});

test('column menu has add card option', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu-item').nth(1)).toContainText('Add card');
});

test('column menu has clear all cards option', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu-item').nth(2)).toContainText('Clear all cards');
});

test('clicking outside column menu closes it', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.locator('.column-menu')).not.toBeVisible();
});
