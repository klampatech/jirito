// JIRITO-123: Columns change size when cards are added/removed.
//
// Run against the test backend on port 3002 (started with
//   JIRITO_DB_PATH=/tmp/jirito-test.db SERVER_PORT=3002 npx tsx server/index.ts
// ).

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots', 'jirito-123-column-width');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const APP_URL = 'http://127.0.0.1:8080/';
const API_URL = 'http://127.0.0.1:3002/';

const SILENT = { 'Content-Type': 'application/json', 'X-Jirito-Silent': '1' };

async function seedFresh() {
  await fetch(`${API_URL}api/state`, {
    method: 'PUT',
    headers: SILENT,
    body: JSON.stringify({
      issues: [], projects: {}, columns: [], comments: [],
      filters: [], activity: [], trash: [], sprints: [], savedFilters: [],
      issueCounter: 100,
    }),
  });

  await fetch(`${API_URL}api/projects`, {
    method: 'POST',
    headers: SILENT,
    body: JSON.stringify({
      id: 'JIRI', name: 'Jirito', key: 'JIRI',
      icon: '🚀', color: '#0052CC', description: '',
    }),
  });

  await fetch(`${API_URL}api/projects/current`, {
    method: 'PUT',
    headers: SILENT,
    body: JSON.stringify({ projectId: 'JIRI' }),
  });
}

async function navigateAndWait(page) {
  await page.goto(APP_URL);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(APP_URL);
  await page.waitForSelector('.column', { timeout: 10000 });
  const skipBtn = page.locator('#onboarding-skip');
  if (await skipBtn.count() > 0 && await skipBtn.isVisible()) {
    await skipBtn.click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);
}

test('JIRITO-123: column widths are identical in empty and populated states', async ({ page }) => {
  await seedFresh();
  await navigateAndWait(page);

  // Measure the width of the first column when empty
  const firstColumn = page.locator('.column').first();
  const emptyWidth = await firstColumn.evaluate(el => el.getBoundingClientRect().width);

  // Create a ticket with an extremely long title (no spaces) to stress overflow
  const longTitle = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const createResp = await fetch(`${API_URL}api/issues`, {
    method: 'POST',
    headers: SILENT,
    body: JSON.stringify({
      title: longTitle,
      description: 'Testing column width stability with long unbroken title.',
      status: 'todo',
      type: 'bug',
      priority: 'high',
      labels: ['test'],
      assignee: 'elmo',
      reporter: 'kyle',
      projectId: 'JIRI',
    }),
  });
  const created = await createResp.json();

  // Wait for the card to appear
  await page.waitForSelector(`.issue-card[data-id="${created.id}"]`, { timeout: 3000 });

  // Measure the column width with a card in it
  const populatedWidth = await firstColumn.evaluate(el => el.getBoundingClientRect().width);

  // The widths must be identical
  expect(populatedWidth).toBe(emptyWidth);

  await page.screenshot({ path: join(SCREENSHOT_DIR, '01-populated-column.png'), fullPage: true });
});

test('JIRITO-123: column widths match across all columns with mixed content', async ({ page }) => {
  await seedFresh();
  await navigateAndWait(page);

  // Create tickets with varied content in different columns
  const tickets = [
    { title: 'Short', status: 'todo', type: 'bug' },
    { title: 'Very long title with spaces that wraps properly to multiple lines without breaking layout integrity and stays within the column bounds', status: 'todo', type: 'task' },
    { title: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', status: 'inprogress', type: 'story' },
    { title: 'Normal medium title', status: 'review', type: 'bug' },
  ];

  for (const t of tickets) {
    await fetch(`${API_URL}api/issues`, {
      method: 'POST',
      headers: SILENT,
      body: JSON.stringify({ ...t, priority: 'medium', assignee: 'bert', reporter: 'kyle', projectId: 'JIRI' }),
    });
  }

  await page.waitForTimeout(1000);

  // Measure all columns
  const columns = page.locator('.column');
  const count = await columns.count();
  const widths = [];
  for (let i = 0; i < count; i++) {
    const w = await columns.nth(i).evaluate(el => el.getBoundingClientRect().width);
    widths.push(w);
  }

  // All columns should have identical widths
  const firstWidth = widths[0];
  for (let i = 1; i < widths.length; i++) {
    expect(widths[i]).toBe(firstWidth);
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, '02-all-columns.png'), fullPage: true });
});
