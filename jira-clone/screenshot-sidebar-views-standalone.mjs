import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'screenshots', 'sidebar-views');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const views = [
  { id: 'board', label: 'Board', index: 0 },
  { id: 'list', label: 'List', index: 1 },
  { id: 'calendar', label: 'Calendar', index: 2 },
  { id: 'dashboard', label: 'Dashboard', index: 3 },
];

async function dismissOnboarding(page) {
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
    await page.waitForTimeout(300);
  }
}

async function clearStorage(page) {
  try { await page.evaluate(() => localStorage.clear()); } catch {}
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///Users/kylelampa/Development/little-coder/jira-clone/index.html');
  await dismissOnboarding(page);
  await page.waitForTimeout(500);

  // Ensure sidebar is expanded
  const wrapper = page.locator('#sidebar-wrapper');
  const collapsed = await wrapper.evaluate(el => el.classList.contains('collapsed'));
  if (collapsed) {
    await page.locator('#sidebar-toggle').click();
    await page.waitForTimeout(300);
  }

  // Take initial Board view screenshot
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SCREENSHOT_DIR, '01-board-view.png'), fullPage: false });
  console.log('✓ Board view screenshot saved');

  for (const view of views) {
    // Click the view item in sidebar
    const viewItems = page.locator('#view-list .view-item');
    await viewItems.nth(view.index).click();
    await page.waitForTimeout(800);

    // Take screenshot
    const filename = `${String(views.indexOf(view) + 2).padStart(2, '0')}-${view.id}-view.png`;
    await page.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false });
    console.log(`✓ ${view.label} view screenshot saved`);
  }

  // Now take screenshots showing the active state of each view in the sidebar
  for (const view of views) {
    const viewItems = page.locator('#view-list .view-item');
    await viewItems.nth(view.index).click();
    await page.waitForTimeout(500);

    const filename = `${String(views.indexOf(view) + 6).padStart(2, '0')}-sidebar-${view.id}-active.png`;
    await page.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false });
    console.log(`✓ Sidebar ${view.label} active screenshot saved`);
  }

  // Take a dark mode version of each view
  await browser.close();
  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage({ viewport: { width: 1440, height: 900 } });
  await page2.goto('file:///Users/kylelampa/Development/little-coder/jira-clone/index.html');
  await dismissOnboarding(page2);
  await page2.waitForTimeout(300);

  // Toggle to dark mode
  await page2.locator('#theme-toggle').click();
  await page2.waitForTimeout(500);

  // Dark mode board
  await page2.screenshot({ path: join(SCREENSHOT_DIR, 'dark-board-view.png'), fullPage: false });
  console.log('✓ Dark mode Board screenshot saved');

  for (const view of views.slice(1)) { // Skip board (already done)
    const viewItems = page2.locator('#view-list .view-item');
    await viewItems.nth(view.index).click();
    await page2.waitForTimeout(800);

    const filename = `dark-${view.id}-view.png`;
    await page2.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false });
    console.log(`✓ Dark mode ${view.label} screenshot saved`);
  }

  await browser2.close();
  console.log('\nAll screenshots saved to:', SCREENSHOT_DIR);
})();
