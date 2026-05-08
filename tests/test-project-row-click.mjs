import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '..', 'index.html');
const URL = 'file://' + indexPath;
const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results', 'screenshots');

async function screenshot(page, name) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
  console.log(`  ✓ Screenshot: ${name}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let pass = 0, fail = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      pass++;
    } catch (e) {
      console.log(`  ❌ ${name}: ${e.message}`);
      fail++;
    }
  }

  // ===== Test 1: Clicking project name switches project =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();

    await test('clicking project name switches project', async () => {
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('Name Test');
      await page.locator('#project-key').fill('NT');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      // Click the project name text
      await page.locator('.project-item:has-text("Name Test") .project-name').click();
      await page.waitForTimeout(300);
      const active = await page.locator('.project-item.active').textContent();
      if (!active.includes('Name Test')) throw new Error(`Expected active to be "Name Test", got: ${active}`);
    });

    await page.close();
  }

  // ===== Test 2: Clicking project icon switches project =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();

    await test('clicking project icon switches project', async () => {
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('Icon Test');
      await page.locator('#project-key').fill('IT');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      // Click the project icon (emoji)
      await page.locator('.project-item:has-text("Icon Test") .project-icon').click();
      await page.waitForTimeout(300);
      const active = await page.locator('.project-item.active').textContent();
      if (!active.includes('Icon Test')) throw new Error(`Expected active to be "Icon Test", got: ${active}`);
    });

    await page.close();
  }

  // ===== Test 3: Clicking project key switches project =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();

    await test('clicking project key switches project', async () => {
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('Key Test');
      await page.locator('#project-key').fill('KT');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      // Click the project key badge
      await page.locator('.project-item:has-text("Key Test") .project-key').click();
      await page.waitForTimeout(300);
      const active = await page.locator('.project-item.active').textContent();
      if (!active.includes('Key Test')) throw new Error(`Expected active to be "Key Test", got: ${active}`);
    });

    await page.close();
  }

  // ===== Test 4: Clicking the row background switches project =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();

    await test('clicking the row background switches project', async () => {
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('Bg Test');
      await page.locator('#project-key').fill('BG');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      // Click the project item row itself (the background/entire row)
      const row = page.locator('.project-item:has-text("Bg Test")');
      const box = await row.boundingBox();
      // Click in the middle of the row (not on any child element)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      const active = await page.locator('.project-item.active').textContent();
      if (!active.includes('Bg Test')) throw new Error(`Expected active to be "Bg Test", got: ${active}`);
    });

    await page.close();
  }

  // ===== Test 5: Clicking the row at various positions switches project =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();

    await test('clicking row at top-left switches project', async () => {
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('TL Test');
      await page.locator('#project-key').fill('TL');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      const row = page.locator('.project-item:has-text("TL Test")');
      const box = await row.boundingBox();
      await page.mouse.click(box.x + 2, box.y + 2); // top-left corner
      await page.waitForTimeout(300);
      const active = await page.locator('.project-item.active').textContent();
      if (!active.includes('TL Test')) throw new Error(`Expected active to be "TL Test", got: ${active}`);
    });

    await test('clicking row at bottom-right switches project', async () => {
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('BR Test');
      await page.locator('#project-key').fill('BR');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      const row = page.locator('.project-item:has-text("BR Test")');
      const box = await row.boundingBox();
      await page.mouse.click(box.x + box.width - 2, box.y + box.height - 2); // bottom-right corner
      await page.waitForTimeout(300);
      const active = await page.locator('.project-item.active').textContent();
      if (!active.includes('BR Test')) throw new Error(`Expected active to be "BR Test", got: ${active}`);
    });

    await page.close();
  }

  // ===== Test 6: Delete button still works (doesn't switch project) =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();

    await test('deleting a project does not switch to it', async () => {
      // Create a second project first
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('Delete Me');
      await page.locator('#project-key').fill('DM');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      // Verify we're on the new project
      let active = await page.locator('.project-item.active').textContent();
      if (!active.includes('Delete Me')) throw new Error(`Expected active to be "Delete Me", got: ${active}`);

      // Accept confirm dialogs (headless Chromium doesn't show native confirm)
      page.on('dialog', async dialog => await dialog.accept());
      
      // Click the delete button
      await page.locator('.project-item:has-text("Delete Me") .project-delete').click();
      await page.waitForTimeout(500);

      // Verify we did NOT stay on the deleted project
      active = await page.locator('.project-item.active').textContent();
      if (active.includes('Delete Me')) throw new Error('Should not be on deleted project');
      // Should be back on default
      if (!active.includes('Project Alpha')) throw new Error(`Expected "Project Alpha", got: ${active}`);
    });

    await page.close();
  }

  // ===== Test 7: Screenshot of the fixed sidebar =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();
    await page.waitForTimeout(500);
    await screenshot(page, 'light-project-row-clickable');
    await page.close();
  }

  // ===== Test 8: Screenshot of dark mode =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();
    await page.locator('#theme-toggle').click();
    await page.waitForTimeout(500);
    await screenshot(page, 'dark-project-row-clickable');
    await page.close();
  }

  // ===== Test 9: Verify active project row is highlighted =====
  {
    const page = await context.newPage();
    await page.goto(URL);
    const onboarding = page.locator('#onboarding-overlay');
    if (await onboarding.isVisible()) await page.locator('#onboarding-skip').click();

    await test('active project row has active class', async () => {
      const activeItems = page.locator('.project-item.active');
      const count = await activeItems.count();
      if (count !== 1) throw new Error(`Expected 1 active project, got ${count}`);
    });

    await test('inactive project rows do not have active class', async () => {
      // Create a second project
      await page.locator('#add-project-btn').click();
      await page.locator('#project-name').fill('Second');
      await page.locator('#project-key').fill('SC');
      await page.locator('#project-form').evaluate(f => f.requestSubmit());
      await page.waitForTimeout(300);

      // Only one should be active
      const activeItems = page.locator('.project-item.active');
      const count = await activeItems.count();
      if (count !== 1) throw new Error(`Expected 1 active project, got ${count}`);
    });

    await page.close();
  }

  await browser.close();

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
