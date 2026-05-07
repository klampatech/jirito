import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const url = 'file:///Users/kylelampa/Development/little-coder/jira-clone/index.html';
const screenshotDir = '/Users/kylelampa/Development/little-coder/jira-clone/test-results/dark-mode';
mkdirSync(screenshotDir, { recursive: true });

async function check() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  // Dismiss onboarding if present
  const onboarding = await page.$('#onboarding-overlay');
  if (onboarding) {
    await page.click('#onboarding-skip');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);

  // 1. Light mode screenshot
  await page.screenshot({ path: `${screenshotDir}/01-light-mode.png`, fullPage: false });
  console.log('✓ Light mode screenshot saved');

  // 2. Toggle to dark mode
  await page.click('#theme-toggle');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/02-dark-mode-board.png`, fullPage: false });
  console.log('✓ Dark mode board screenshot saved');

  // 3. Open Create Issue modal in dark mode
  await page.click('#add-issue-btn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/03-dark-mode-create-modal.png`, fullPage: false });
  console.log('✓ Dark mode create modal screenshot saved');

  // 4. Open a detail panel in dark mode
  await page.click('#modal-close');
  await page.waitForTimeout(200);
  await page.click('[data-status="todo"] .issue-card');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/04-dark-mode-detail-panel.png`, fullPage: false });
  console.log('✓ Dark mode detail panel screenshot saved');

  // 5. Close detail panel first, then toggle sidebar
  await page.click('#detail-close');
  await page.waitForTimeout(200);
  await page.click('#toggle-sidebar');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDir}/05-dark-mode-sidebar-collapsed.png`, fullPage: false });
  console.log('✓ Dark mode sidebar collapsed screenshot saved');

  // 6. Open sidebar again and take full page
  await page.click('#toggle-sidebar');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDir}/06-dark-mode-full-page.png`, fullPage: true });
  console.log('✓ Dark mode full page screenshot saved');

  // 7. Check for hardcoded colors that may fail in dark mode
  const darkIssues = await page.evaluate(() => {
    const issues = [];
    // Check CSS rules for hardcoded colors that don't use CSS variables
    const sheets = document.styleSheets;
    for (const sheet of sheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.style && rule.style.cssText) {
            // Look for hardcoded hex colors that are NOT in dark-theme overrides
            const text = rule.cssText;
            if (text.includes('[data-theme="dark"]')) continue;
            // Check for problematic hardcoded colors
            const hexColors = text.match(/#[0-9a-fA-F]{6}/g) || [];
            if (hexColors.length > 0) {
              issues.push({
                rule: rule.selectorText || 'unknown',
                colors: hexColors,
                text: rule.cssText.substring(0, 200)
              });
            }
          }
        }
      } catch (e) { /* cross-origin */ }
    }
    return issues;
  });
  console.log('\n⚠️  Hardcoded hex colors found in CSS (excluding dark-theme overrides):');
  darkIssues.forEach(i => {
    console.log(`  ${i.rule}: ${i.colors.join(', ')}`);
  });

  // 8. Check computed colors on key elements in dark mode
  const computedColors = await page.evaluate(() => {
    const checks = [];
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!dark) return checks;

    // Check modal text colors
    const modal = document.querySelector('.modal');
    if (modal) {
      const h2 = modal.querySelector('h2');
      if (h2) {
        const cs = getComputedStyle(h2);
        checks.push({ element: 'modal h2', color: cs.color, bg: cs.backgroundColor, ok: cs.color.startsWith('rgb(230') || cs.color.startsWith('rgb(255') || cs.color.startsWith('rgb(200') });
      }
      const labels = modal.querySelectorAll('label');
      labels.forEach((l, i) => {
        const cs = getComputedStyle(l);
        checks.push({ element: `modal label[${i}]`, color: cs.color, bg: cs.backgroundColor, ok: cs.color.startsWith('rgb(139') || cs.color.startsWith('rgb(200') || cs.color.startsWith('rgb(230') });
      });
      const inputs = modal.querySelectorAll('input, textarea, select');
      inputs.forEach((inp, i) => {
        const cs = getComputedStyle(inp);
        checks.push({ element: `modal input[${i}]`, color: cs.color, bg: cs.backgroundColor, ok: cs.color.startsWith('rgb(200') || cs.color.startsWith('rgb(230') || cs.color.startsWith('rgb(255') || cs.color.startsWith('rgb(150') });
      });
    }

    // Check detail panel text colors
    const panel = document.querySelector('.detail-panel.open');
    if (panel) {
      const labels = panel.querySelectorAll('.detail-field label');
      labels.forEach((l, i) => {
        const cs = getComputedStyle(l);
        checks.push({ element: `detail label[${i}]`, color: cs.color, bg: cs.backgroundColor, ok: cs.color.startsWith('rgb(139') || cs.color.startsWith('rgb(200') || cs.color.startsWith('rgb(230') });
      });
      const values = panel.querySelectorAll('.detail-field .value');
      values.forEach((v, i) => {
        const cs = getComputedStyle(v);
        checks.push({ element: `detail value[${i}]`, color: cs.color, bg: cs.backgroundColor, ok: cs.color.startsWith('rgb(200') || cs.color.startsWith('rgb(230') || cs.color.startsWith('rgb(255') });
      });
      const textareas = panel.querySelectorAll('textarea, input, select');
      textareas.forEach((t, i) => {
        const cs = getComputedStyle(t);
        checks.push({ element: `detail input[${i}]`, color: cs.color, bg: cs.backgroundColor, ok: cs.color.startsWith('rgb(200') || cs.color.startsWith('rgb(230') || cs.color.startsWith('rgb(255') || cs.color.startsWith('rgb(150') });
      });
    }

    // Check notification dropdown
    const bell = document.querySelector('#notification-bell');
    if (bell) {
      bell.click();
      const dd = document.querySelector('#notification-dropdown');
      if (dd && dd.style.display !== 'none') {
        const cs = getComputedStyle(dd);
        checks.push({ element: 'notification-dropdown', color: cs.color, bg: cs.backgroundColor, ok: cs.backgroundColor.startsWith('rgb(41') || cs.backgroundColor.startsWith('rgb(255') });
      }
    }

    return checks;
  });

  console.log('\n📊 Computed color checks in dark mode:');
  let allOk = true;
  computedColors.forEach(c => {
    const status = c.ok ? '✅' : '❌';
    if (!c.ok) allOk = false;
    console.log(`  ${status} ${c.element}: color=${c.color} bg=${c.bg}`);
  });

  // 9. Check contrast ratios for text on backgrounds
  console.log('\n🔍 Contrast ratio analysis:');
  const contrastChecks = await page.evaluate(() => {
    const results = [];
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!dark) return results;

    // Modal overlay background
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      const cs = getComputedStyle(overlay);
      results.push({ element: 'modal overlay bg', color: cs.backgroundColor, note: 'should be semi-transparent dark' });
    }

    // Modal card background
    const modal = document.querySelector('.modal');
    if (modal) {
      const cs = getComputedStyle(modal);
      results.push({ element: 'modal card bg', color: cs.backgroundColor, note: 'should be light enough for dark text' });
    }

    // Check all text elements in modal for readability
    const modalTexts = modal ? modal.querySelectorAll('h2, label, input, textarea, select, button') : [];
    modalTexts.forEach(el => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const fg = cs.color;
      // Simple check: if bg is very dark and fg is dark, it's a problem
      const bgMatch = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      const fgMatch = fg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (bgMatch && fgMatch) {
        const [_, br, bg2, bgr] = bgMatch.map(Number);
        const [fr, fg2, fgr] = fgMatch.map(Number);
        const bgBrightness = (br * 299 + bg2 * 587 + bgr * 114) / 1000;
        const fgBrightness = (fr * 299 + fg2 * 587 + fgr * 114) / 1000;
        const ratio = Math.abs(bgBrightness - fgBrightness) / 128;
        if (bgBrightness < 100 && fgBrightness < 100) {
          results.push({ element: `${el.tagName}.${el.className.split(' ')[0] || ''}`, fg, bg, note: `DARK TEXT ON DARK BG! brightness=${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)}` });
        } else if (bgBrightness > 200 && fgBrightness > 200) {
          results.push({ element: `${el.tagName}.${el.className.split(' ')[0] || ''}`, fg, bg, note: `LIGHT TEXT ON LIGHT BG! brightness=${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)}` });
        }
      }
    });

    // Check detail panel
    const panel = document.querySelector('.detail-panel.open');
    if (panel) {
      const panelTexts = panel.querySelectorAll('.detail-field label, .detail-field .value, textarea, input, select');
      panelTexts.forEach(el => {
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
            results.push({ element: `detail ${el.tagName}.${el.className.split(' ')[0] || ''}`, fg, bg, note: `DARK TEXT ON DARK BG! brightness=${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)}` });
          } else if (bgBrightness > 200 && fgBrightness > 200) {
            results.push({ element: `detail ${el.tagName}.${el.className.split(' ')[0] || ''}`, fg, bg, note: `LIGHT TEXT ON LIGHT BG! brightness=${bgBrightness.toFixed(0)}/${fgBrightness.toFixed(0)}` });
          }
        }
      });
    }

    return results;
  });

  contrastChecks.forEach(c => {
    console.log(`  ${c.note}: ${c.element}`);
  });

  await browser.close();

  if (contrastChecks.length > 0) {
    console.log(`\n⚠️  Found ${contrastChecks.length} potential contrast issues in dark mode!`);
  } else {
    console.log('\n✅ No obvious contrast issues found.');
  }
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
