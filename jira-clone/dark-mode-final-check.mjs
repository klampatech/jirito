import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const url = 'file:///Users/kylelampa/Development/little-coder/jira-clone/index.html';
const screenshotDir = '/Users/kylelampa/Development/little-coder/jira-clone/test-results/dark-mode';
mkdirSync(screenshotDir, { recursive: true });

async function check() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  const onboarding = await page.$('#onboarding-overlay');
  if (onboarding) { await page.click('#onboarding-skip'); await page.waitForTimeout(300); }
  await page.waitForTimeout(500);

  // Toggle dark mode
  await page.click('#theme-toggle');
  await page.waitForTimeout(300);

  let allIssues = [];

  // Check all text elements across the page for dark mode readability
  const issues = await page.evaluate(() => {
    const results = [];
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!dark) return results;

    // Check all elements with text content
    const allEls = document.querySelectorAll('*');
    allEls.forEach(el => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const fg = cs.color;
      const bgMatch = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      const fgMatch = fg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (bgMatch && fgMatch) {
        const [_, br, bg2, bgr] = bgMatch.map(Number);
        const [fr, fg2, fgr] = fgMatch.map(Number);
        const bgBrightness = (br * 299 + bg2 * 587 + bgr * 114) / 1000;
        const fgBrightness = (fr * 299 + fg2 * 587 + fgr * 114) / 1000;
        // Only flag if both are dark (brightness < 80) or both are light (brightness > 220)
        if (bgBrightness < 80 && fgBrightness < 80) {
          results.push({
            element: `${el.tagName}.${el.className.split(' ')[0] || ''}`,
            fg, bg,
            note: `DARK TEXT ON DARK BG (${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)})`
          });
        } else if (bgBrightness > 220 && fgBrightness > 220) {
          results.push({
            element: `${el.tagName}.${el.className.split(' ')[0] || ''}`,
            fg, bg,
            note: `LIGHT TEXT ON LIGHT BG (${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)})`
          });
        }
      }
    });
    return results;
  });

  if (issues.length > 0) {
    console.log('❌ Dark mode readability issues found:');
    issues.forEach(i => console.log(`  ${i.note}: ${i.element}`));
  } else {
    console.log('✅ All text elements have sufficient contrast in dark mode!');
  }

  // Take screenshots of all key screens
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-board.png`, fullPage: false });
  console.log('✓ Dark mode board screenshot saved');

  // Open create modal
  await page.click('#add-issue-btn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-create-modal.png`, fullPage: false });
  console.log('✓ Dark mode create modal screenshot saved');

  // Close modal, open detail panel
  await page.click('#modal-close');
  await page.waitForTimeout(200);
  await page.click('[data-status="todo"] .issue-card');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-detail-panel.png`, fullPage: false });
  console.log('✓ Dark mode detail panel screenshot saved');

  // Close detail, switch to list view
  await page.click('#detail-close');
  await page.waitForTimeout(200);
  await page.click('#view-list .view-item:nth-child(2)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-list-view.png`, fullPage: false });
  console.log('✓ Dark mode list view screenshot saved');

  // Switch back to board, open notifications
  await page.click('#view-list .view-item:nth-child(1)');
  await page.waitForTimeout(200);
  await page.click('#notification-bell');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-notifications.png`, fullPage: false });
  console.log('✓ Dark mode notifications screenshot saved');

  // Open column menu
  await page.click('[data-status="todo"] .column-header .btn-icon');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-column-menu.png`, fullPage: false });
  console.log('✓ Dark mode column menu screenshot saved');

  // Toggle sidebar
  await page.click('#toggle-sidebar');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-sidebar-collapsed.png`, fullPage: false });
  console.log('✓ Dark mode sidebar collapsed screenshot saved');

  // Full page
  await page.screenshot({ path: `${screenshotDir}/FINAL-dark-mode-full-page.png`, fullPage: true });
  console.log('✓ Dark mode full page screenshot saved');

  await browser.close();
}

check().catch(e => { console.error(e); process.exit(1); });
