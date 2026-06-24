import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots');
const APP_URL = 'http://127.0.0.1:8080/';

// Helper to clear localStorage safely
async function clearStorage(page) {
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {
    // file:// protocol may block localStorage access
  }
}

// Sample issues for the screenshot test, mirrored to the server via /api/issues.
// The server is the source of truth in CI (the static file server on 8080
// proxies /api/* to the test jirito server), so we have to seed through
// the API — not localStorage. Earlier test files (e2e.spec.mjs) clear the
// DB in beforeEach, so the global setup's pre-seed is gone by the time
// screenshot-capture runs.
const SAMPLE_ISSUES = [
  { id: 'PROJ-101', title: 'Design system tokens', description: 'Define color tokens', status: 'todo', priority: 'high', labels: ['design'], assignee: 'Alice', reporter: 'Bob', projectId: 'default', sprintId: null, storyPoints: 5, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'PROJ-102', title: 'Auth flow', description: 'Implement OAuth', status: 'todo', priority: 'high', labels: ['backend'], assignee: 'Charlie', reporter: 'Alice', projectId: 'default', sprintId: null, storyPoints: 8, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'PROJ-103', title: 'API endpoints', description: 'REST API design', status: 'inprogress', priority: 'medium', labels: ['backend'], assignee: 'Diana', reporter: 'Bob', projectId: 'default', sprintId: null, storyPoints: 3, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'PROJ-104', title: 'Unit tests', description: 'Core module tests', status: 'inprogress', priority: 'medium', labels: ['testing'], assignee: 'Eve', reporter: 'Alice', projectId: 'default', sprintId: null, storyPoints: 5, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'PROJ-105', title: 'Wireframes', description: 'Dashboard wireframes', status: 'inreview', priority: 'low', labels: ['design'], assignee: 'Alice', reporter: 'Charlie', projectId: 'default', sprintId: null, storyPoints: 2, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'PROJ-106', title: 'Deploy pipeline', description: 'CI/CD setup', status: 'done', priority: 'medium', labels: ['devops'], assignee: 'Frank', reporter: 'Bob', projectId: 'default', sprintId: null, storyPoints: 5, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// Helper to seed sample data via the API. The jirito server is the source
// of truth — the static client in CI runs in server mode, so localStorage
// writes are ignored. We POST each issue to /api/issues, then the test
// reloads so the client fetches them.
async function seedViaApi() {
  for (const issue of SAMPLE_ISSUES) {
    await fetch(APP_URL + 'api/issues', {
      method: 'POST',
      // X-Jirito-Silent: 1 — see helpers.mjs TEST_HEADERS comment.
      // Screenshot tests don't need the wiretap to know about fixture
      // issues; the comment with the screenshot is the only event
      // these tests are "advertising" to Discord.
      headers: { 'Content-Type': 'application/json', 'X-Jirito-Silent': '1' },
      body: JSON.stringify(issue),
    });
  }
}

// Helper to navigate to the app
async function navigate(page) {
  await clearStorage(page);
  await page.goto(APP_URL);
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Seed sample data via the API so the board renders with issue cards.
  // Without this, the board is empty (the e2e beforeEach cleared the DB)
  // and tests that interact with cards (detail panel, drag preview,
  // activity feed) will timeout.
  await seedViaApi();
  // Reload to load the seeded data from the server.
  await page.reload();
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  // Dismiss onboarding if it appears
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
}

// Helper to set theme and wait
async function setTheme(page, theme) {
  if (theme === 'dark') {
    const current = await page.evaluate(() => localStorage.getItem('jirito-theme'));
    if (current !== 'dark') {
      await page.locator('#theme-toggle').click();
      await page.waitForTimeout(500);
    }
  } else {
    const current = await page.evaluate(() => localStorage.getItem('jirito-theme'));
    if (current === 'dark') {
      await page.locator('#theme-toggle').click();
      await page.waitForTimeout(500);
    }
  }
}

// Helper to take screenshot
async function capture(page, name, viewport) {
  const dir = join(SCREENSHOT_DIR, 'automation');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), fullPage: false });
  console.log(`  ✓ Captured: ${name}`);
}

// Set viewport
test.use({ viewport: { width: 1440, height: 900 } });

// ===== LIGHT MODE SCREENSHOTS =====

test('01 - Light Board View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  await page.waitForTimeout(300);
  await capture(page, '01-light-board.png');
});

test('02 - Light Detail Panel', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Click the first issue card to open detail panel
  const firstCard = page.locator('[data-status="todo"] .issue-card').first();
  await firstCard.click();
  await page.waitForTimeout(500);
  await capture(page, '02-light-detail-panel.png');
});

test('03 - Light Create Modal', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  await page.locator('#add-issue-btn').click();
  await page.waitForTimeout(500);
  await capture(page, '03-light-create-modal.png');
});

test('04 - Light List View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Click 'List' view item in sidebar
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('List')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(500);
  await capture(page, '04-light-list-view.png');
});

test('05 - Light Filters', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Filters are always visible on the board header
  await page.waitForSelector('.filter-group', { state: 'visible' });
  await page.waitForTimeout(500);
  await capture(page, '05-light-filters.png');
});

test('06 - Light Search', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  await page.locator('#search-input').fill('PROJ');
  await page.waitForTimeout(500);
  await capture(page, '06-light-search.png');
});

test('07 - Light Sidebar Open', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Make sure sidebar is open
  const sidebar = page.locator('#sidebar');
  const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  if (state) {
    await page.locator('#sidebar-toggle').click();
    await page.waitForTimeout(300);
  }
  await capture(page, '07-light-sidebar-open.png');
});

test('08 - Light Sidebar Collapsed', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Collapse sidebar
  const sidebar = page.locator('#sidebar');
  const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  if (!state) {
    await page.locator('#sidebar-toggle').click();
    await page.waitForTimeout(300);
  }
  await capture(page, '08-light-sidebar-collapsed.png');
});

test('09 - Light Notifications', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  await page.locator('#notification-bell').click();
  await page.waitForTimeout(500);
  await capture(page, '09-light-notifications.png');
});

test('10 - Light Calendar View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Click the calendar view item in sidebar
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('Calendar')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(500);
  await capture(page, '10-light-calendar.png');
});

test('11 - Light Dashboard View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Click the dashboard view item in sidebar
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('Dashboard')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(500);
  await capture(page, '11-light-dashboard.png');
});

test('12 - Light Drag Preview', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.hover();
  await page.waitForTimeout(300);
  await capture(page, '12-light-drag-preview.png');
});

test('13 - Light Activity Feed', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  const firstCard = page.locator('[data-status="todo"] .issue-card').first();
  await firstCard.click();
  await page.waitForTimeout(500);
  await capture(page, '13-light-activity-feed.png');
});

test('14 - Light New Project Modal', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Open new project modal via sidebar button
  await page.locator('#add-project-btn').click();
  await page.waitForTimeout(500);
  await capture(page, '14-light-new-project.png');
});

test('15 - Light Overdue Detail', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'light');
  // Click notification bell then click first overdue item
  const bell = page.locator('#notification-bell');
  if (await bell.isVisible()) {
    await bell.click();
    await page.waitForTimeout(300);
    const firstOverdue = page.locator('.notification-item').first();
    if (await firstOverdue.isVisible()) {
      await firstOverdue.click();
      await page.waitForTimeout(500);
    }
  }
  await capture(page, '15-light-overdue-detail.png');
});

test('16 - Light Mobile View', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await navigate(page);
  await setTheme(page, 'light');
  await page.waitForTimeout(300);
  await capture(page, '16-light-mobile.png');
});

// ===== DARK MODE SCREENSHOTS =====

test('17 - Dark Board View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  await page.waitForTimeout(500);
  await capture(page, '17-dark-board.png');
});

test('18 - Dark Detail Panel', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  const firstCard = page.locator('[data-status="todo"] .issue-card').first();
  await firstCard.click();
  await page.waitForTimeout(500);
  await capture(page, '18-dark-detail-panel.png');
});

test('19 - Dark Create Modal', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  await page.locator('#add-issue-btn').click();
  await page.waitForTimeout(500);
  await capture(page, '19-dark-create-modal.png');
});

test('20 - Dark List View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  // Click 'List' view item in sidebar
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('List')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(500);
  await capture(page, '20-dark-list-view.png');
});

test('21 - Dark Filters', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  await page.waitForSelector('.filter-group', { state: 'visible' });
  await page.waitForTimeout(500);
  await capture(page, '21-dark-filters.png');
});

test('22 - Dark Search', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  await page.locator('#search-input').fill('PROJ');
  await page.waitForTimeout(500);
  await capture(page, '22-dark-search.png');
});

test('23 - Dark Sidebar Open', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  const sidebar = page.locator('#sidebar');
  const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  if (state) {
    await page.locator('#sidebar-toggle').click();
    await page.waitForTimeout(300);
  }
  await capture(page, '23-dark-sidebar-open.png');
});

test('24 - Dark Sidebar Collapsed', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  const sidebar = page.locator('#sidebar');
  const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  if (!state) {
    await page.locator('#sidebar-toggle').click();
    await page.waitForTimeout(300);
  }
  await capture(page, '24-dark-sidebar-collapsed.png');
});

test('25 - Dark Notifications', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  await page.locator('#notification-bell').click();
  await page.waitForTimeout(500);
  await capture(page, '25-dark-notifications.png');
});

test('26 - Dark Calendar View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  // Click the calendar view item in sidebar
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('Calendar')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(500);
  await capture(page, '26-dark-calendar.png');
});

test('27 - Dark Dashboard View', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  // Click the dashboard view item in sidebar
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('Dashboard')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(500);
  await capture(page, '27-dark-dashboard.png');
});

test('28 - Dark Bulk Action', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  // Select multiple issues via bulk action
  const checkboxes = page.locator('.issue-checkbox').first();
  if (await checkboxes.isVisible()) {
    await checkboxes.click();
    await page.waitForTimeout(300);
    const checkboxes2 = page.locator('.issue-checkbox').nth(1);
    if (await checkboxes2.isVisible()) {
      await checkboxes2.click();
      await page.waitForTimeout(300);
    }
  }
  await capture(page, '28-dark-bulk-action.png');
});

test('29 - Dark Activity Feed', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  const firstCard = page.locator('[data-status="todo"] .issue-card').first();
  await firstCard.click();
  await page.waitForTimeout(500);
  await capture(page, '29-dark-activity-feed.png');
});

test('30 - Dark New Project Modal', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  await page.locator('#add-project-btn').click();
  await page.waitForTimeout(500);
  await capture(page, '30-dark-new-project.png');
});

test('31 - Dark Overdue Detail', async ({ page }) => {
  await navigate(page);
  await setTheme(page, 'dark');
  const bell = page.locator('#notification-bell');
  if (await bell.isVisible()) {
    await bell.click();
    await page.waitForTimeout(300);
    const firstOverdue = page.locator('.notification-item').first();
    if (await firstOverdue.isVisible()) {
      await firstOverdue.click();
      await page.waitForTimeout(500);
    }
  }
  await capture(page, '31-dark-overdue-detail.png');
});

test('32 - Dark Mobile View', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await navigate(page);
  await setTheme(page, 'dark');
  await page.waitForTimeout(300);
  await capture(page, '32-dark-mobile.png');
});
