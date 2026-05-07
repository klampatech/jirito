import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SCREENSHOT_DIR = join(__dirname, 'screenshots', 'sidebar-views');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function clearStorage(page) {
  try { await page.evaluate(() => localStorage.clear()); } catch {}
}

async function dismissOnboarding(page) {
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
}

test.describe('Sidebar View Navigation Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await page.goto('file:///Users/kylelampa/Development/little-coder/jira-clone/index.html');
    await dismissOnboarding(page);
    // Ensure sidebar is expanded
    const wrapper = page.locator('#sidebar-wrapper');
    if (await wrapper.locator('.sidebar-toggle').isVisible()) {
      // Check if collapsed
      const hasCollapsed = await wrapper.locator('.sidebar-toggle').isVisible();
      // If sidebar is collapsed, expand it
      const collapsed = await wrapper.evaluate(el => el.classList.contains('collapsed'));
      if (collapsed) {
        await page.locator('#sidebar-toggle').click();
      }
    }
    // Wait for render
    await page.waitForTimeout(500);
  });

  test('Board view - default', async ({ page }) => {
    // Board is the default view
    await page.locator('#view-list .view-item').first().click(); // Board
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '01-board-view.png'), fullPage: false });
  });

  test('List view', async ({ page }) => {
    await page.locator('#view-list .view-item').nth(1).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '02-list-view.png'), fullPage: false });
  });

  test('Calendar view', async ({ page }) => {
    await page.locator('#view-list .view-item').nth(2).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '03-calendar-view.png'), fullPage: false });
  });

  test('Dashboard view', async ({ page }) => {
    await page.locator('#view-list .view-item').nth(3).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '04-dashboard-view.png'), fullPage: false });
  });

  test('All views - sidebar highlighted state', async ({ page }) => {
    // Board
    await page.locator('#view-list .view-item').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '05-sidebar-board-active.png'), fullPage: false });

    // List
    await page.locator('#view-list .view-item').nth(1).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '06-sidebar-list-active.png'), fullPage: false });

    // Calendar
    await page.locator('#view-list .view-item').nth(2).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '07-sidebar-calendar-active.png'), fullPage: false });

    // Dashboard
    await page.locator('#view-list .view-item').nth(3).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '08-sidebar-dashboard-active.png'), fullPage: false });
  });
});
