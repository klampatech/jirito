import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

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

  // Open detail panel
  await page.click('[data-status="todo"] .issue-card');
  await page.waitForTimeout(300);

  // Check all computed colors on detail panel elements
  const panelChecks = await page.evaluate(() => {
    const panel = document.querySelector('.detail-panel.open');
    if (!panel) return [];
    const checks = [];
    const allEls = panel.querySelectorAll('*');
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
        if (bgBrightness < 100 && fgBrightness < 100) {
          checks.push({ tag: el.tagName, cls: el.className.split(' ')[0] || '', fg, bg, note: `DARK TEXT ON DARK BG brightness=${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)}` });
        } else if (bgBrightness > 200 && fgBrightness > 200) {
          checks.push({ tag: el.tagName, cls: el.className.split(' ')[0] || '', fg, bg, note: `LIGHT TEXT ON LIGHT BG brightness=${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)}` });
        }
      }
    });
    return checks;
  });

  console.log('Detail panel contrast issues:');
  panelChecks.forEach(c => console.log(`  ${c.tag}.${c.cls}: ${c.note}`));

  // Check modal inputs specifically
  await page.click('#detail-close');
  await page.waitForTimeout(200);
  await page.click('#add-issue-btn');
  await page.waitForTimeout(300);

  const modalChecks = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    if (!modal) return [];
    const checks = [];
    const allEls = modal.querySelectorAll('input, textarea, select');
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
        const ratio = Math.abs(bgBrightness - fgBrightness);
        checks.push({ tag: el.tagName, name: el.id || el.type || '', fg, bg, bgBrightness: bgBrightness.toFixed(0), fgBrightness: fgBrightness.toFixed(0), ratio: ratio.toFixed(0) });
      }
    });
    return checks;
  });

  console.log('\nModal input color analysis in dark mode:');
  modalChecks.forEach(c => {
    const ok = parseInt(c.ratio) > 50;
    console.log(`  ${ok ? '✅' : '❌'} ${c.tag}[${c.name}]: fg=${c.fg} bg=${c.bg} brightness=${c.bgBrightness}/${c.fgBrightness} diff=${c.ratio}`);
  });

  // Check list view
  await page.click('#modal-close');
  await page.waitForTimeout(200);
  await page.click('#view-list .view-item:nth-child(2)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/07-dark-mode-list-view.png`, fullPage: false });
  console.log('\n✓ Dark mode list view screenshot saved');

  // Check notification dropdown
  await page.click('#view-list .view-item:nth-child(1)');
  await page.waitForTimeout(200);
  await page.click('#notification-bell');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/08-dark-mode-notifications.png`, fullPage: false });
  console.log('✓ Dark mode notifications screenshot saved');

  // Check column menu
  await page.click('[data-status="todo"] .column-header .btn-icon');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/09-dark-mode-column-menu.png`, fullPage: false });
  console.log('✓ Dark mode column menu screenshot saved');

  // Check bulk action bar
  await page.click('[data-status="todo"] .issue-card');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDir}/10-dark-mode-bulk-bar.png`, fullPage: false });
  console.log('✓ Dark mode bulk action bar screenshot saved');

  // Check trash section
  await page.click('#detail-close');
  await page.waitForTimeout(200);
  // Delete an issue to trigger trash
  await page.evaluate(() => {
    const dialog = window.confirm = () => true;
  });
  await page.click('[data-status="todo"] .issue-card');
  await page.waitForTimeout(200);
  await page.click('#delete-issue-btn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/11-dark-mode-trash.png`, fullPage: false });
  console.log('✓ Dark mode trash screenshot saved');

  await browser.close();
}

check().catch(e => { console.error(e); process.exit(1); });
