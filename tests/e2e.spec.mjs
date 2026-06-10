// tests/e2e.spec.mjs - End-to-end tests for Jirito
import { test, expect } from '@playwright/test';
import { clearDb, seedIssues } from './helpers.mjs';

const APP_URL = 'http://127.0.0.1:8080/';

async function navigate(page) {
  const consoleMessages = [];
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });
  
  await page.goto(APP_URL);
  // Wait for the async loadState() to complete so subsequent assertions
  // observe the same data the rest of the app does.
  await page.waitForFunction(() => window.__jiritoStateReady === true, { timeout: 10000 });
  
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
  
  await page.waitForSelector('#board', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(2000);
  
  return { consoleMessages, errors };
}

test.describe('E2E Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    console.log('[e2e] beforeEach: clearing database...');
    await clearDb();
    console.log('[e2e] beforeEach: database cleared');
  });

  test('should load data from server on startup', async ({ page }) => {
    // Uses the standard seedIssues fixture (3 todo, 1 inprogress, 1 review, 1 done = 6 total).
    // The test verifies the data is loaded from the server on the first page load.
    await seedIssues();

    const { consoleMessages, errors } = await navigate(page);
    consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
    if (errors.length > 0) {
      console.log(`JS ERRORS: ${JSON.stringify(errors)}`);
    }

    // All 6 seeded issues should be rendered as cards across the 4 columns.
    const cards = page.locator('#board .issue-card');
    await expect(cards).toHaveCount(6);

    // Spot-check that the seeded titles appear on the board.
    const board = await page.locator('#board').textContent();
    expect(board).toContain('Design login page mockup');
    expect(board).toContain('Fix auth token refresh bug');
    expect(board).toContain('Update dependencies');
  });

  test('should save data to server via UI', async ({ page }) => {
    const { consoleMessages, errors } = await navigate(page);
    consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
    if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);

    await page.locator('#add-issue-btn').click();
    await page.locator('#issue-title').fill('E2E UI Created Issue');
    await page.locator('#issue-desc').fill('Created via E2E test UI');
    await page.locator('#issue-type').selectOption('story');
    await page.locator('#issue-priority').selectOption('high');
    await page.locator('#issue-story-points').fill('5');
    await page.locator('#issue-assignee').fill('Test User');
    await page.locator('#issue-form button[type="submit"]').click();

    await expect(page.locator('#board')).toContainText('E2E UI Created Issue');

    // Wait for the save to complete
    await page.waitForTimeout(1500);
    
    // Verify the issue was saved to the server
    const resp = await page.request.get('http://127.0.0.1:3001/api/issues');
    const issues = await resp.json();
    const found = issues.find(i => i.title === 'E2E UI Created Issue');
    expect(found).toBeDefined();
    expect(found.priority).toBe('high');
  });

  test('should fallback to localStorage when server is down', async ({ page }) => {
    // Override fetch to block ALL server requests before page loads
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = function(url, ...args) {
        if (typeof url === 'string' && (url.includes('127.0.0.1:3001') || url === '/api/health' || url.startsWith('/api/'))) {
          return Promise.reject(new Error('Connection refused'));
        }
        return originalFetch.call(this, url, ...args);
      };
    });
    
    const consoleMessages = [];
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });
    
    await page.goto(APP_URL);
    
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) {
      await page.locator('#onboarding-skip').click();
    }
    
    await page.waitForSelector('#board', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(2000);
    
    consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
    if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);

    // Verify offline mode is active
    const offlineMsg = await page.evaluate(() => {
      const storage = window.storage;
      return storage ? storage.getStorageType() : 'unknown';
    });
    expect(offlineMsg).toBe('offline');

    // Create an issue — it should be saved to localStorage (not server)
    await page.locator('#add-issue-btn').click();
    await page.locator('#issue-title').fill('Offline Test Issue');
    await page.locator('#issue-desc').fill('Should work offline');
    await page.locator('#issue-type').selectOption('bug');
    await page.locator('#issue-priority').selectOption('medium');
    await page.locator('#issue-form button[type="submit"]').click();

    await expect(page.locator('#board').getByRole('button', { name: 'PROJ-107: Offline Test Issue' })).toBeVisible();

    // Wait for the save to complete
    await page.waitForTimeout(1000);

    // Verify the issue was saved to localStorage
    const stored = await page.evaluate(() => localStorage.getItem('jirito-state'));
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored);
    expect(parsed && parsed.issues && parsed.issues.some(i => i.title === 'Offline Test Issue')).toBe(true);
  });
});
