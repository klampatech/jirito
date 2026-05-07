// Screenshot automation script for Jirito UI/UX evaluation
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, 'index.html');
const fileUrl = 'file://' + htmlPath;
const outputDir = join(__dirname, 'screenshots');

const screenshots = [];

async function take(name, page, delay = 500) {
  await page.waitForTimeout(delay);
  const path = join(outputDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  screenshots.push(path);
  console.log(`✓ Saved: ${path}`);
  return path;
}

async function dismissOnboarding(page) {
  const overlay = page.locator('#onboarding-overlay');
  if (await overlay.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('#onboarding-skip').click();
    await page.waitForTimeout(500);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  
  // Create output directory
  const fs = await import('fs');
  const path = await import('path');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // ===== 1. Light Theme - Default Board View =====
  let page = await context.newPage();
  await page.goto(fileUrl);
  await dismissOnboarding(page);
  await take('01-light-board', page);

  // ===== 2. Light Theme - Detail Panel Open =====
  await page.locator('[data-status="todo"] .issue-card').first().click();
  await page.waitForTimeout(600);
  await take('02-light-detail-panel', page);

  // ===== 3. Light Theme - Create Issue Modal =====
  await page.locator('#detail-close').click();
  await page.waitForTimeout(300);
  await page.locator('#add-issue-btn').click();
  await page.waitForTimeout(500);
  await take('03-light-create-modal', page);
  await page.locator('#modal-cancel').click();
  await page.waitForTimeout(300);

  // ===== 4. Light Theme - List View =====
  await page.locator('#view-list .view-item').nth(1).click();
  await page.waitForTimeout(500);
  await take('04-light-list-view', page);

  // ===== 5. Light Theme - Filters Applied =====
  await page.locator('#view-list .view-item').nth(0).click(); // back to board
  await page.waitForTimeout(300);
  await page.locator('#filter-type').selectOption('bug');
  await page.locator('#filter-priority').selectOption('high');
  await page.waitForTimeout(500);
  await take('05-light-filters', page);
  // Reset filters
  await page.locator('#filter-type').selectOption('all');
  await page.locator('#filter-priority').selectOption('all');
  await page.waitForTimeout(300);

  // ===== 6. Light Theme - Search =====
  await page.locator('#search-input').fill('auth');
  await page.waitForTimeout(500);
  await take('06-light-search', page);
  await page.locator('#search-input').clear();
  await page.waitForTimeout(300);

  // ===== 7. Light Theme - Sidebar Collapsed =====
  await page.locator('#sidebar-toggle').click();
  await page.waitForTimeout(500);
  await take('07-light-sidebar-collapsed', page);

  // ===== 8. Light Theme - Notification Bell =====
  await page.locator('#sidebar-toggle').click(); // reopen sidebar
  await page.waitForTimeout(300);
  await page.locator('#notification-bell').click();
  await page.waitForTimeout(500);
  await take('08-light-notifications', page);
  await page.mouse.click(10, 10); // close dropdown
  await page.waitForTimeout(300);

  // ===== 9. Dark Theme - Default Board View =====
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800); // wait for CSS transitions
  await take('09-dark-board', page);

  // ===== 10. Dark Theme - Detail Panel =====
  await page.locator('[data-status="todo"] .issue-card').first().click();
  await page.waitForTimeout(600);
  await take('10-dark-detail-panel', page);

  // ===== 11. Dark Theme - Create Modal =====
  await page.locator('#detail-close').click();
  await page.waitForTimeout(300);
  await page.locator('#add-issue-btn').click();
  await page.waitForTimeout(500);
  await take('11-dark-create-modal', page);
  await page.locator('#modal-cancel').click();
  await page.waitForTimeout(300);

  // ===== 12. Dark Theme - List View =====
  await page.locator('#view-list .view-item').nth(1).click();
  await page.waitForTimeout(500);
  await take('12-dark-list-view', page);

  // ===== 13. Dark Theme - Sidebar Collapsed =====
  await page.locator('#view-list .view-item').nth(0).click();
  await page.waitForTimeout(300);
  await page.locator('#sidebar-toggle').click();
  await page.waitForTimeout(500);
  await take('13-dark-sidebar-collapsed', page);

  // ===== 14. Dark Theme - Bulk Action Bar =====
  await page.locator('#sidebar-toggle').click(); // reopen sidebar
  await page.waitForTimeout(300);
  // Select a card
  await page.locator('[data-status="todo"] .issue-checkbox').first().click();
  await page.waitForTimeout(500);
  await take('14-dark-bulk-action', page);
  await page.locator('#bulk-clear').click();
  await page.waitForTimeout(300);

  // ===== 15. Dark Theme - Column Menu =====
  await page.locator('[data-status="todo"] .column-header .btn-icon').click();
  await page.waitForTimeout(500);
  await take('15-dark-column-menu', page);
  await page.mouse.click(10, 10); // close menu
  await page.waitForTimeout(300);

  // ===== 16. Light Theme - Drag & Drop Preview =====
  await page.locator('#theme-toggle').click(); // back to light
  await page.waitForTimeout(800);
  await dismissOnboarding(page);
  // Simulate drag by hovering over columns
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCol = page.locator('[data-status="inprogress"] .column-body');
  await inProgressCol.hover();
  await page.waitForTimeout(500);
  await take('16-light-drag-preview', page);

  // ===== 17. Light Theme - Activity Feed =====
  await take('17-light-activity-feed', page, 200);

  // ===== 18. Dark Theme - Activity Feed =====
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  await take('18-dark-activity-feed', page);

  // ===== 19. Light Theme - Mobile-like viewport =====
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  await take('19-light-mobile', page);

  // ===== 20. Dark Theme - Mobile-like viewport =====
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  await take('20-dark-mobile', page);

  // ===== 21. Light Theme - New Project Modal =====
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  await page.locator('#add-project-btn').click();
  await page.waitForTimeout(500);
  await take('21-light-new-project-modal', page);
  await page.locator('#project-cancel').click();
  await page.waitForTimeout(300);

  // ===== 22. Dark Theme - New Project Modal =====
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  await page.locator('#add-project-btn').click();
  await page.waitForTimeout(500);
  await take('22-dark-new-project-modal', page);
  await page.locator('#project-cancel').click();
  await page.waitForTimeout(300);

  // ===== 23. Light Theme - Overdue Issue Detail =====
  // Find an overdue issue (PROJ-102 has dueDate 2026-05-01 which may be overdue)
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  // Open the bug issue which has an overdue date
  const bugCard = page.locator('[data-status="inprogress"] .issue-card').first();
  await bugCard.click();
  await page.waitForTimeout(600);
  await take('23-light-overdue-detail', page);

  // ===== 24. Dark Theme - Overdue Issue Detail =====
  await page.locator('#detail-close').click();
  await page.waitForTimeout(300);
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(800);
  await bugCard.click();
  await page.waitForTimeout(600);
  await take('24-dark-overdue-detail', page);

  await page.close();
  await browser.close();

  console.log(`\n✅ ${screenshots.length} screenshots saved to ${outputDir}/`);
  console.log('\n📋 UI/UX Evaluation Report:');
  console.log('='.repeat(60));
  console.log('Screenshots captured for:');
  screenshots.forEach((s, i) => {
    const name = s.split('/').pop().replace('.png', '');
    console.log(`  ${String(i + 1).padStart(2)}. ${name}`);
  });
  console.log('='.repeat(60));
})();
