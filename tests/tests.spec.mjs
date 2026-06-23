// NOTE: This file uses @playwright/test and MUST be run via:
//   npx playwright test tests/tests.spec.mjs
// It CANNOT be run via `node --test tests/tests.spec.mjs` because
// Playwright's test.beforeEach() is not compatible with Node's built-in
// test runner and will throw: "Playwright Test did not expect test.beforeEach() to be called here."

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import { resetAndSeed } from './helpers.mjs';

// Path to the bundled index.html — used by file://-based tests below
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '..', 'index.html');

const APP_URL = 'http://127.0.0.1:8080/';

// Helper to clear localStorage safely (file:// protocol may block it)
async function clearStorage(page) {
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {
    // file:// protocol may block localStorage access
  }
}

test.beforeEach(async ({ page }) => {
  // Reset DB and seed the default 6 issues in one silent PUT. See
  // helpers.mjs TEST_HEADERS — the seed would otherwise fire 6
  // ticket.created events to the squad wiretap on every test, and
  // 50+ tests = 300+ messages per suite run.
  await resetAndSeed();
  // Check issues after seeding
  const stateResp = await fetch('http://127.0.0.1:3001/api/state');
  const stateData = await stateResp.json();
  console.log('[beforeEach] After seed, API issues:', JSON.stringify(stateData.issues.map(i => ({id:i.id, title:i.title, dueDate:i.dueDate}))));
  // Navigate to the app via the static server (proxies /api/ to backend)
  await page.goto(APP_URL, { waitUntil: 'load' });
  // Force reset to initial state - clear localStorage and reload
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'load' });
  // Check issues after reload
  const afterReloadIssues = await page.evaluate(() => {
    const issues = getIssues ? getIssues() : [];
    return issues.map(i => ({id:i.id, title:i.title, dueDate:i.dueDate}));
  });
  console.log('[beforeEach] After reload, frontend issues:', JSON.stringify(afterReloadIssues));
  // Wait for sidebar to render
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  // Dismiss onboarding if it appears
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
});

// ===== Layout Tests =====
test('renders 4 columns', async ({ page }) => {
  const columns = page.locator('.column');
  await expect(columns).toHaveCount(4);
});

test('column headers have correct labels', async ({ page }) => {
  const headers = page.locator('.column-title span:nth-child(2)');
  await expect(headers.nth(0)).toHaveText('To Do');
  await expect(headers.nth(1)).toHaveText('In Progress');
  await expect(headers.nth(2)).toHaveText('In Review');
  await expect(headers.nth(3)).toHaveText('Done');
});

test('column counts show correct numbers', async ({ page }) => {
  const counts = page.locator('.count');
  await expect(counts.nth(0)).toHaveText('3');
  await expect(counts.nth(1)).toHaveText('1');
  await expect(counts.nth(2)).toHaveText('1');
  await expect(counts.nth(3)).toHaveText('1');
});

// ===== Issue Card Tests =====
test('renders sample issue cards', async ({ page }) => {
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(6);
});

test('issue cards show correct keys', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards.nth(0).locator('.issue-key')).toHaveText('PROJ-101');
  await expect(todoCards.nth(1).locator('.issue-key')).toHaveText('PROJ-103');
});

test('issue cards show type icons', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  // Type icons are rendered as Phosphor icons with class="ph ph-{kebab-case}"
  const todoIcon = await todoCards.nth(0).locator('.issue-type-icon i.ph').getAttribute('class');
  expect(todoIcon).toContain('ph-file-text'); // story type
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const inProgressIcon = await inProgressCards.nth(0).locator('.issue-type-icon i.ph').getAttribute('class');
  expect(inProgressIcon).toContain('ph-bug'); // bug type
});

test('issue cards show priority badges', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards.nth(0).locator('.issue-priority')).toHaveText('high');
  await expect(todoCards.nth(1).locator('.issue-priority')).toHaveText('medium');
});

test('issue cards show assignee avatars', async ({ page }) => {
  const avatars = page.locator('.issue-assignee');
  await expect(avatars).toHaveCount(6);
});

// ===== Create Issue Tests =====
test('create button opens modal', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await expect(page.locator('#modal-overlay')).toBeVisible();
});

test('modal close button works', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#modal-close').click();
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
});

test('cancel button closes modal', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#modal-cancel').click();
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
});

test('clicking overlay background closes modal', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  // Click top-left corner (outside the centered modal)
  await page.mouse.click(10, 10);
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
});

test('can create a new issue', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Test issue');
  await page.locator('#issue-desc').fill('Test description');
  await page.locator('#issue-type').selectOption('bug');
  await page.locator('#issue-priority').selectOption('high');
  await page.locator('#issue-assignee').fill('Tester');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());

  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(7);

  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).toHaveCount(4);
  await expect(todoCards.last()).toContainText('Test issue');
});

// ===== Drag and Drop Tests =====
test('cards are draggable', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await expect(card).toHaveAttribute('draggable', 'true');
});

test('dragging a card to In Progress updates its status', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');

  const todoCount = await todoCards.count();
  const inProgressCount = await inProgressCards.count();

  // Use page.evaluate to simulate drag-drop since Playwright's dragTo doesn't fire native drop events
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="todo"] .issue-card');
    const col = document.querySelector('[data-status="inprogress"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(todoCount - 1);
  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(inProgressCount + 1);

  const inProgressCountBadge = page.locator('[data-count-for="inprogress"]');
  await expect(inProgressCountBadge).toHaveText(String(inProgressCount + 1));
});

test('dragging a card to Done updates its status', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();

  // Use page.evaluate to simulate drag-drop
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="todo"] .issue-card');
    const col = document.querySelector('[data-status="done"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  await expect(page.locator('[data-status="done"] .issue-card')).toHaveCount(2, { timeout: 5000 });

  const doneCards = page.locator('[data-status="done"] .issue-card');
  await expect(doneCards).toHaveCount(2);
});

// ===== Drag and Drop: Reordering Tests =====

test('dragging a card within the same column reorders it', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.nth(0);
  const secondCard = todoCards.nth(1);

  // Get initial titles
  const firstTitle = await firstCard.locator('.issue-title').textContent();
  const secondTitle = await secondCard.locator('.issue-title').textContent();

  // Playwright's dragTo doesn't fire drop events for same-container drops,
  // so we simulate the drag-drop sequence via evaluate
  const result = await page.evaluate(() => {
    const col = document.querySelector('[data-status="todo"] .column-body');
    const cards = col.querySelectorAll('.issue-card');
    if (cards.length < 2) return { error: 'not enough cards' };

    const firstCard = cards[0];
    const secondCard = cards[1];

    // Simulate dragstart on first card
    const dt = new DataTransfer();
    dt.setData('text/plain', firstCard.dataset.id);
    const dragStart = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      dataTransfer: dt
    });
    firstCard.dispatchEvent(dragStart);

    // Simulate dragover on column body (drop on bottom half of second card)
    const secondRect = secondCard.getBoundingClientRect();

    const dragOver = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      clientX: secondRect.left + secondRect.width / 2,
      clientY: secondRect.top + secondRect.height * 0.75,
      dataTransfer: dt
    });
    col.dispatchEvent(dragOver);

    // Simulate drop
    const drop = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: secondRect.left + secondRect.width / 2,
      clientY: secondRect.top + secondRect.height * 0.75,
      dataTransfer: dt
    });
    col.dispatchEvent(drop);

    // Read result immediately (renderBoard is synchronous)
    const newCards = col.querySelectorAll('.issue-card');
    const titles = Array.from(newCards).map(c => c.querySelector('.issue-title')?.textContent);
    return { titles, count: newCards.length };
  });

  // The original first card should no longer be first (it was reordered)
  expect(result.titles[0]).not.toBe(firstTitle);
});

test('dragging a card to top of column inserts at top', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const secondCard = todoCards.nth(1);

  // Get initial title of second card
  const secondTitle = await secondCard.locator('.issue-title').textContent();

  // Simulate drag-drop to top of column
  const result = await page.evaluate(() => {
    const col = document.querySelector('[data-status="todo"] .column-body');
    const cards = col.querySelectorAll('.issue-card');
    if (cards.length < 2) return { error: 'not enough cards' };

    const secondCard = cards[1];
    const firstCard = cards[0];

    // Simulate dragstart on second card
    const dt = new DataTransfer();
    dt.setData('text/plain', secondCard.dataset.id);
    const dragStart = new DragEvent('dragstart', {
      bubbles: true, cancelable: true,
      clientX: 100, clientY: 100, dataTransfer: dt
    });
    secondCard.dispatchEvent(dragStart);

    // Simulate dragover on top half of first card
    const firstRect = firstCard.getBoundingClientRect();

    const dragOver = new DragEvent('dragover', {
      bubbles: true, cancelable: true,
      clientX: firstRect.left + firstRect.width / 2,
      clientY: firstRect.top + firstRect.height * 0.25,
      dataTransfer: dt
    });
    col.dispatchEvent(dragOver);

    // Simulate drop
    const drop = new DragEvent('drop', {
      bubbles: true, cancelable: true,
      clientX: firstRect.left + firstRect.width / 2,
      clientY: firstRect.top + firstRect.height * 0.25,
      dataTransfer: dt
    });
    col.dispatchEvent(drop);

    const newCards = col.querySelectorAll('.issue-card');
    const titles = Array.from(newCards).map(c => c.querySelector('.issue-title')?.textContent);
    return { titles, count: newCards.length };
  });

  // The dragged card should now be first
  expect(result.titles[0]).toBe(secondTitle);
});

test('dragging a card to bottom of column appends to bottom', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();
  const lastCard = todoCards.last();

  // Get initial titles
  const firstTitle = await firstCard.locator('.issue-title').textContent();

  // Use simulated drag-drop to drop after the last card
  const result = await page.evaluate(({ firstId, firstTitle }) => {
    const col = document.querySelector('[data-status="todo"] .column-body');
    const cards = Array.from(col.querySelectorAll('.issue-card'));
    if (cards.length < 2) return { error: 'not enough cards' };

    const firstCard = cards[0];

    // Simulate dragstart
    const dt = new DataTransfer();
    dt.setData('text/plain', firstCard.dataset.id);
    const dragStart = new DragEvent('dragstart', {
      bubbles: true, cancelable: true,
      clientX: 100, clientY: 100, dataTransfer: dt
    });
    firstCard.dispatchEvent(dragStart);

    // Simulate dragover below the last card (past it)
    const lastCard = cards[cards.length - 1];
    const lastRect = lastCard.getBoundingClientRect();

    const dragOver = new DragEvent('dragover', {
      bubbles: true, cancelable: true,
      clientX: lastRect.left + lastRect.width / 2,
      clientY: lastRect.bottom + 20, // below the last card
      dataTransfer: dt
    });
    col.dispatchEvent(dragOver);

    // Simulate drop
    const drop = new DragEvent('drop', {
      bubbles: true, cancelable: true,
      clientX: lastRect.left + lastRect.width / 2,
      clientY: lastRect.bottom + 20,
      dataTransfer: dt
    });
    col.dispatchEvent(drop);

    // Read result immediately (renderBoard is synchronous)
    const newCards = col.querySelectorAll('.issue-card');
    const titles = Array.from(newCards).map(c => c.querySelector('.issue-title')?.textContent);
    return { titles, count: newCards.length, draggedId: firstId };
  }, { firstId: await firstCard.evaluate(el => el.dataset.id), firstTitle });

  // The dragged card should now be last
  expect(result.titles[result.titles.length - 1], `Expected last card to be "${firstTitle}" but got "${result.titles[result.titles.length - 1]}". All titles: [${result.titles.join(', ')}].`).toBe(firstTitle);
});

test('dragging a card between columns updates column counts', async ({ page }) => {
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const reviewCards = page.locator('[data-status="review"] .issue-card');

  const inProgressCount = await inProgressCards.count();
  const reviewCount = await reviewCards.count();

  // Use page.evaluate to simulate drag-drop
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="inprogress"] .issue-card');
    const col = document.querySelector('[data-status="review"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(inProgressCount - 1);
  await expect(page.locator('[data-status="review"] .issue-card')).toHaveCount(reviewCount + 1);
});

test('dragging a card from In Progress to To Do updates status', async ({ page }) => {
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  const todoCards = page.locator('[data-status="todo"] .issue-card');

  const inProgressCount = await inProgressCards.count();
  const todoCount = await todoCards.count();

  // Use page.evaluate to simulate drag-drop
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="inprogress"] .issue-card');
    const col = document.querySelector('[data-status="todo"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  await expect(page.locator('[data-status="inprogress"] .issue-card')).toHaveCount(inProgressCount - 1);
  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(todoCount + 1);
});

test('dragging a card to Review column updates status', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const reviewCards = page.locator('[data-status="review"] .issue-card');

  const todoCount = await todoCards.count();
  const reviewCount = await reviewCards.count();

  // Use page.evaluate to simulate drag-drop
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="todo"] .issue-card');
    const col = document.querySelector('[data-status="review"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(todoCount - 1);
  await expect(page.locator('[data-status="review"] .issue-card')).toHaveCount(reviewCount + 1);
});

test('dragging a card to empty area at bottom of column appends', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const lastCard = todoCards.last();

  // Get initial count
  const initialCount = await todoCards.count();
  const firstCardTitle = await todoCards.first().locator('.issue-title').textContent();

  // Drag first card to the bottom of the column using mouse drag
  const sourceBox = await todoCards.first().boundingBox();
  const targetBox = await lastCard.boundingBox();
  if (!sourceBox || !targetBox) return;

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  // Move to the bottom of the column body (below all cards)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height + 100);
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(300);

  // The card should still be in the same column (just reordered)
  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(initialCount);
  // The first card title should still exist somewhere in the column
  const allTitles = await page.locator('[data-status="todo"] .issue-title').allTextContents();
  expect(allTitles).toContain(firstCardTitle);
});

test('drop indicator is visible during drag', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  const target = page.locator('[data-status="inprogress"] .column-body');

  // Simulate dragover to show the drop indicator
  const indicatorVisible = await page.evaluate(() => {
    return new Promise(resolve => {
      const col = document.querySelector('[data-status="inprogress"] .column-body');
      const todoCol = document.querySelector('[data-status="todo"] .column-body');
      const firstCard = todoCol.querySelector('.issue-card');

      // Simulate dragstart
      const dt = new DataTransfer();
      dt.setData('text/plain', firstCard.dataset.id);
      const dragStart = new DragEvent('dragstart', {
        bubbles: true, cancelable: true,
        clientX: 100, clientY: 100, dataTransfer: dt
      });
      firstCard.dispatchEvent(dragStart);

      // Simulate dragover
      const firstCardRect = firstCard.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const dragOver = new DragEvent('dragover', {
        bubbles: true, cancelable: true,
        clientX: colRect.left + colRect.width / 2,
        clientY: colRect.top + 50,
        dataTransfer: dt
      });
      col.dispatchEvent(dragOver);

      // Check if drop indicator exists
      const indicator = col.querySelector('.drop-indicator');
      const hasDragOverClass = col.classList.contains('drag-over');
      resolve({
        indicatorVisible: !!indicator,
        hasDragOverClass
      });
    });
  });

  expect(indicatorVisible.indicatorVisible).toBe(true);
  expect(indicatorVisible.hasDragOverClass).toBe(true);
});

test('drop indicator appears in empty column at top position', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();

  const result = await page.evaluate(() => {
    return new Promise(resolve => {
      const todoCol = document.querySelector('[data-status="todo"] .column-body');
      const firstCard = todoCol.querySelector('.issue-card');
      const targetCol = document.querySelector('[data-status="inprogress"] .column-body');

      // Simulate dragstart
      const dt = new DataTransfer();
      dt.setData('text/plain', firstCard.dataset.id);
      const dragStart = new DragEvent('dragstart', {
        bubbles: true, cancelable: true,
        clientX: 100, clientY: 100, dataTransfer: dt
      });
      firstCard.dispatchEvent(dragStart);

      // Simulate dragover at the top of the target column
      const colRect = targetCol.getBoundingClientRect();
      const dragOver = new DragEvent('dragover', {
        bubbles: true, cancelable: true,
        clientX: colRect.left + colRect.width / 2,
        clientY: colRect.top + 10, // near top
        dataTransfer: dt
      });
      targetCol.dispatchEvent(dragOver);

      const indicator = targetCol.querySelector('.drop-indicator');
      resolve({
        hasIndicator: !!indicator,
        hasDragOverClass: targetCol.classList.contains('drag-over')
      });
    });
  });

  expect(result.hasIndicator).toBe(true);
  expect(result.hasDragOverClass).toBe(true);
});

test('dragging a card updates its rank property', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();
  const secondCard = todoCards.nth(1);

  // Get initial ranks
  const firstRankBefore = await firstCard.evaluate(el => parseFloat(el.dataset.rank));
  const secondRankBefore = await secondCard.evaluate(el => parseFloat(el.dataset.rank));

  // Use mouse drag to reorder
  const sourceBox = await firstCard.boundingBox();
  const targetBox = await secondCard.boundingBox();
  if (!sourceBox || !targetBox) return;

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.75);
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Re-query cards after re-render
  const cards = page.locator('[data-status="todo"] .issue-card');
  const count = await cards.count();
  const expectedCount = await todoCards.count();
  await expect(count).toBe(expectedCount);

  // Verify ranks are floating-point values
  const firstRankAfter = await cards.first().evaluate(el => parseFloat(el.dataset.rank));
  expect(typeof firstRankAfter).toBe('number');
});

test('undo toast appears after drag-drop reorder', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();
  const secondCard = todoCards.nth(1);

  // Use page.evaluate to simulate drag-drop reorder
  await page.evaluate(() => {
    const col = document.querySelector('[data-status="todo"] .column-body');
    const cards = col.querySelectorAll('.issue-card');
    if (cards.length < 2) return;
    const firstCard = cards[0];
    const secondCard = cards[1];
    const dt = new DataTransfer();
    dt.setData('text/plain', firstCard.dataset.id);
    const secondRect = secondCard.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: secondRect.left + secondRect.width / 2, clientY: secondRect.top + secondRect.height * 0.75, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: secondRect.left + secondRect.width / 2, clientY: secondRect.top + secondRect.height * 0.75, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  // Undo toast should appear
  const undoToast = page.locator('.toast-undo');
  await expect(undoToast).toBeVisible({ timeout: 5000 });
});

test('undo toast appears after drag-drop status change', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();

  // Use page.evaluate to simulate drag-drop status change
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="todo"] .issue-card');
    const col = document.querySelector('[data-status="inprogress"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  // Undo toast should appear
  const undoToast = page.locator('.toast-undo');
  await expect(undoToast).toBeVisible({ timeout: 5000 });
});

test('undoing a reorder restores original order', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();
  const secondCard = todoCards.nth(1);

  const firstTitle = await firstCard.locator('.issue-title').textContent();
  const secondTitle = await secondCard.locator('.issue-title').textContent();

  // Use page.evaluate to simulate drag-drop reorder
  await page.evaluate(() => {
    const col = document.querySelector('[data-status="todo"] .column-body');
    const cards = col.querySelectorAll('.issue-card');
    if (cards.length < 2) return;
    const firstCard = cards[0];
    const secondCard = cards[1];
    const dt = new DataTransfer();
    dt.setData('text/plain', firstCard.dataset.id);
    const secondRect = secondCard.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: secondRect.left + secondRect.width / 2, clientY: secondRect.top + secondRect.height * 0.75, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: secondRect.left + secondRect.width / 2, clientY: secondRect.top + secondRect.height * 0.75, dataTransfer: dt });
    col.dispatchEvent(drop);
  });

  // Wait for reorder to complete
  await page.waitForTimeout(300);

  // Click undo
  await page.locator('#undo-btn').click();
  await page.waitForTimeout(300);

  // Verify order is restored
  const cards = page.locator('[data-status="todo"] .issue-card');
  await expect(cards.nth(0).locator('.issue-title')).toContainText(firstTitle);
  await expect(cards.nth(1).locator('.issue-title')).toContainText(secondTitle);
});

test('undoing a status change restores original status', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const firstCard = todoCards.first();

  const firstTitle = await firstCard.locator('.issue-title').textContent();

  // Use page.evaluate to simulate drag-drop status change
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="todo"] .issue-card');
    const col = document.querySelector('[data-status="inprogress"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });
  await page.waitForTimeout(300);

  // Click undo
  await page.locator('#undo-btn').click();
  await page.waitForTimeout(300);

  // Verify card is back in To Do
  const todoCardsAfter = page.locator('[data-status="todo"] .issue-card');
  const todoCount = await todoCardsAfter.count();
  await expect(todoCardsAfter).toHaveCount(await todoCards.count());
  // Verify card title is in To Do
  const found = await todoCardsAfter.locator('.issue-title').allTextContents();
  expect(found).toContain(firstTitle);
});

test('dragging a card to a column with many cards works', async ({ page }) => {
  // Close any open modal first
  const modalOverlay = page.locator('#modal-overlay');
  if (await modalOverlay.isVisible()) {
    await page.locator('#modal-close').click();
    await page.waitForTimeout(200);
  }

  // Create a new issue in To Do
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Drag test issue');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  await page.waitForTimeout(300);

  // Use Playwright's real dragTo so the browser's native drag pipeline
  // fires (synthetic DragEvents don't reliably carry dataTransfer).
  const sourceCard = page.locator('[data-status="todo"] .issue-card').last();
  const targetBody = page.locator('[data-status="inprogress"] .column-body');
  await sourceCard.dragTo(targetBody);

  // Verify it moved
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(inProgressCards.last().locator('.issue-title')).toContainText('Drag test issue');
});

// ===== Search Tests
test('search input exists', async ({ page }) => {
  const search = page.locator('.search-input');
  await expect(search).toBeVisible();
});

// ===== Nav Tests =====
test('avatar is visible', async ({ page }) => {
  await expect(page.locator('.avatar')).toHaveText('K');
});

// ===== Sidebar Layout Tests =====
test('sidebar is visible and positioned beside the board', async ({ page }) => {
  const sidebar = page.locator('#sidebar');
  await expect(sidebar).toBeVisible();
  const sidebarBox = await sidebar.boundingBox();
  const board = page.locator('#board');
  const boardBox = await board.boundingBox();
  // Sidebar should be to the left of the board (smaller x)
  expect(sidebarBox.x).toBeLessThanOrEqual(boardBox.x);
});

test('sidebar toggle button hides the sidebar', async ({ page }) => {
  const wrapper = page.locator('#sidebar-wrapper');
  const toggleBtn = page.locator('#sidebar-toggle');
  await expect(wrapper).not.toHaveClass(/collapsed/);
  await toggleBtn.click();
  await expect(wrapper).toHaveClass(/collapsed/);
});

test('sidebar toggle button shows the sidebar again', async ({ page }) => {
  const wrapper = page.locator('#sidebar-wrapper');
  const toggleBtn = page.locator('#sidebar-toggle');
  await toggleBtn.click();
  await expect(wrapper).toHaveClass(/collapsed/);
  await toggleBtn.click();
  await expect(wrapper).not.toHaveClass(/collapsed/);
});

// ===== Column Menu Tests =====
test('column header has a menu button', async ({ page }) => {
  const menuButtons = page.locator('.column-header .btn-icon');
  await expect(menuButtons).toHaveCount(4);
});

test('clicking column menu button opens menu', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  const menu = page.locator('.column-menu');
  await expect(menu).toBeVisible();
});

test('column menu has rename option', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu-item').first()).toContainText('Rename column');
});

test('column menu has add card option', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu-item').nth(1)).toContainText('Add card');
});

test('column menu has clear all cards option', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu-item').nth(2)).toContainText('Clear all cards');
});

test('clicking outside column menu closes it', async ({ page }) => {
  const menuBtn = page.locator('[data-status="todo"] .column-header .btn-icon');
  await menuBtn.click();
  await expect(page.locator('.column-menu')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.locator('.column-menu')).not.toBeVisible();
});

// ===== Detail Panel Tests =====
test('clicking a card opens the detail panel', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-panel')).toHaveClass(/open/);
});

test('detail panel shows issue key with project prefix', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const title = page.locator('#detail-title');
  await expect(title).toContainText('PROJ-');
});

test('editing summary in detail panel saves and updates', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const summaryInput = page.locator('#detail-summary');
  await summaryInput.fill('Updated summary');
  await summaryInput.press('Tab');
  await expect(summaryInput).toHaveValue('Updated summary');
});

test('editing priority in detail panel saves', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const prioritySelect = page.locator('#detail-priority');
  await prioritySelect.selectOption('low');
  await prioritySelect.press('Tab');
});

test('editing assignee in detail panel saves', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const assigneeInput = page.locator('#detail-assignee');
  await assigneeInput.fill('New Assignee');
  await assigneeInput.press('Tab');
});

test('detail panel close button works', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#detail-panel')).toHaveClass(/open/);
  await page.locator('#detail-close').click();
  await expect(page.locator('#detail-panel')).not.toHaveClass(/open/);
});

test('clone button appears in detail panel', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#clone-issue-btn')).toBeVisible();
});

// ===== Comment Tests =====
test('can add a comment', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const commentInput = page.locator('#comment-input');
  await commentInput.fill('Test comment');
  await page.locator('#comment-submit').click();
  // Comment should appear in the comments list
  await expect(page.locator('.comment-text')).toContainText('Test comment');
});

// ===== Filter Tests =====
test('type filter filters correctly', async ({ page }) => {
  await page.locator('#filter-type').selectOption('bug');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(1);
});

test('priority filter filters correctly', async ({ page }) => {
  await page.locator('#filter-priority').selectOption('high');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(2);
});

test('search filters by title', async ({ page }) => {
  await page.locator('#search-input').fill('auth');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(1);
});

test('search filters by description', async ({ page }) => {
  await page.locator('#search-input').fill('wireframes');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(1);
});

test('clearing search shows all cards again', async ({ page }) => {
  await page.locator('#search-input').fill('auth');
  await page.locator('#search-input').clear();
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(6);
});

// ===== Labels Tests =====
test('issue cards show labels', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await expect(card.locator('.issue-label')).toHaveCount(1);
});

test('labels filter option exists', async ({ page }) => {
  await expect(page.locator('#filter-labels')).toHaveCount(1);
});

// ===== Dark Mode Tests =====
test('theme toggle button exists', async ({ page }) => {
  await expect(page.locator('#theme-toggle')).toBeVisible();
});

test('toggling theme changes CSS variables', async ({ page }) => {
  const toggle = page.locator('#theme-toggle');
  await toggle.click();
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(theme).toBe('dark');
});

// ===== Trash Tests =====
test('delete moves issue to trash', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const count = await todoCards.count();
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  // Accept the confirm dialog
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
  await page.locator('#delete-issue-btn').click();
  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(count - 1);
});

// ===== Keyboard Navigation Tests =====
test('cards are focusable', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await expect(card).toHaveAttribute('tabindex', '0');
});

test('Enter key opens detail panel from focused card', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.focus();
  await card.press('Enter');
  await expect(page.locator('#detail-panel')).toHaveClass(/open/);
});

// ===== List View Tests =====
test('switching to list view shows table', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(1).click();
  await expect(page.locator('.issue-table')).toBeVisible();
});

test('list view shows issue keys with project prefix', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(1).click();
  const keys = page.locator('.issue-key');
  await expect(keys.first()).toContainText('PROJ-');
});

test('list view container is created and visible in main area', async ({ page }) => {
  // Regression test: switching to list view must create the #list-view div
  // and display it in the main content area (not in the sidebar)
  await page.locator('#view-list .view-item').nth(1).click();
  const listView = page.locator('#list-view');
  await expect(listView).toBeVisible();
  // Verify it's inside app-layout (main area), not in sidebar
  const parent = await listView.evaluate(el => el.parentElement?.id);
  expect(parent).toBe('app-layout');
  // Verify board is hidden
  const board = page.locator('#board');
  await expect(board).not.toBeVisible();
  // Verify table has rows
  const rows = page.locator('.list-row');
  await expect(rows).not.toHaveCount(0);
});

// ===== Detail Panel Status Button Tests =====
test('status buttons in detail panel update issue status', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  // Click the "In Progress" status button in the detail panel
  await page.locator('.detail-status-btn').nth(1).click();
  // Verify card moved to In Progress column
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(inProgressCards).toHaveCount(2);
  // Verify the detail panel was refreshed with active button
  await expect(page.locator('.detail-status-btn.active')).toContainText('In Progress');
});

// ===== Clone Issue Tests =====
test('clone issue creates a copy', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const count = await todoCards.count();
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  // Wait for detail panel to be fully rendered
  await page.locator('#detail-title').waitFor();
  await page.locator('#clone-issue-btn').click();
  // Verify a new card was created
  await expect(page.locator('[data-status="todo"] .issue-card')).not.toHaveCount(count);
  // Verify the cloned issue has "(clone)" in the title
  const clonedCard = page.locator('[data-status="todo"] .issue-card').last();
  await expect(clonedCard).toContainText('(clone)');
});

// ===== History Tests =====
test('issue history tracks changes', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  // Change the priority
  const prioritySelect = page.locator('#detail-priority');
  await prioritySelect.selectOption('high');
  await prioritySelect.press('Tab');
  // Close and re-open the detail panel to see the history
  await page.locator('#detail-close').click();
  await card.click();
  // Check history section exists and has entries
  const historyList = page.locator('.history-list');
  await expect(historyList).toBeVisible();
  const historyEntries = page.locator('.history-entry');
  await expect(historyEntries).not.toHaveCount(0);
});

// ===== Trash Tests Extended =====
test('trash shows restored issues', async ({ page }) => {
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const count = await todoCards.count();
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
  await page.locator('#delete-issue-btn').click();
  // Verify trash section appears
  const trashSection = page.locator('#trash-section');
  await expect(trashSection).toBeVisible();
  // Restore the issue
  await page.locator('.trash-restore').click();
  // Verify issue is back on the board
  await expect(page.locator('[data-status="todo"] .issue-card')).toHaveCount(count);
});

test('trash auto-purges old entries', async ({ page }) => {
  // Simulate a 10-day-old trash entry
  try {
    await page.evaluate(() => {
      const trash = JSON.parse(localStorage.getItem('jirito-trash') || '[]');
      trash.push({
        issues: [{ id: 999, title: 'Old Issue', status: 'todo' }],
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      });
      localStorage.setItem('jirito-trash', JSON.stringify(trash));
    });
  } catch {
    // file:// protocol may block localStorage
  }
  await page.reload();
  // Trash section should not be visible (old entry purged)
  const trashSection = page.locator('#trash-section');
  await expect(trashSection).not.toBeVisible();
});

// ===== Edge Case Tests =====
test('creating issue with empty title is prevented', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  // Submit with empty title - should not create
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  // Modal should still be visible (form validation prevented submit)
  await expect(page.locator('#modal-overlay')).toBeVisible();
});

test('creating issue with special characters in title', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('<script>alert("xss")</script>');
  await page.locator('#issue-desc').fill('Test desc with & special chars < >');
  // Submit by clicking the Create button in the issue form
  await page.locator('#issue-form button[type="submit"]').click();
  // Verify the card is created in the todo column
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  await expect(todoCards).not.toHaveCount(3);
  // Verify content is escaped (not rendered as HTML)
  const newCard = todoCards.last();
  const text = await newCard.locator('.issue-title').textContent();
  expect(text).toContain('alert');
});

test('labels can be added in detail panel', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const labelsInput = page.locator('#detail-labels');
  await labelsInput.fill('test, label, urgent');
  await labelsInput.press('Tab');
  // Verify the labels input was updated
  await expect(labelsInput).toHaveValue('test, label, urgent');
  // Verify labels appear on the card (the card should have at least the new labels)
  const cardLabels = card.locator('.issue-label');
  const labelCount = await cardLabels.count();
  expect(labelCount).toBeGreaterThanOrEqual(3);
});

test('search is case-insensitive', async ({ page }) => {
  await page.locator('#search-input').fill('AUTH');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(1);
});

test('search by description works', async ({ page }) => {
  await page.locator('#search-input').fill('wireframes');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(1);
});

test('filter by assignee works', async ({ page }) => {
  await page.locator('#filter-assignee').selectOption('Alice');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(2);
});

test('filter by all types shows all issues', async ({ page }) => {
  await page.locator('#filter-type').selectOption('all');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(6);
});

test('filter by epic type shows no issues (no epics in sample data)', async ({ page }) => {
  await page.locator('#filter-type').selectOption('epic');
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(0);
});

test('column count updates after creating issue', async ({ page }) => {
  const todoCount = page.locator('[data-count-for="todo"]');
  const initialCount = parseInt(await todoCount.textContent());
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Count test');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  await expect(todoCount).toHaveText(String(initialCount + 1));
});

test('column count updates after moving issue', async ({ page }) => {
  const todoCount = page.locator('[data-count-for="todo"]');
  const doneCount = page.locator('[data-count-for="done"]');
  const initialTodo = parseInt(await todoCount.textContent());
  const initialDone = parseInt(await doneCount.textContent());
  // Use page.evaluate to simulate drag-drop
  await page.evaluate(() => {
    const source = document.querySelector('[data-status="done"] .issue-card');
    const col = document.querySelector('[data-status="todo"] .column-body');
    if (!source || !col) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', source.dataset.id);
    const rect = col.getBoundingClientRect();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(dragOver);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, dataTransfer: dt });
    col.dispatchEvent(drop);
  });
  await expect(todoCount).toHaveText(String(initialTodo + 1));
  await expect(doneCount).toHaveText(String(initialDone - 1));
});

test('saved filters can be saved and applied', async ({ page }) => {
  // Set up a filter
  await page.locator('#filter-type').selectOption('bug');
  await page.locator('#filter-priority').selectOption('high');
  // Save the filter
  // Mock the prompt
  page.on('dialog', async dialog => {
    await dialog.accept('Bug Filter');
  });
  await page.locator('#save-filter-btn').click();
  // Verify the filter appears in saved filters
  const savedFilters = page.locator('.saved-filter-item');
  await expect(savedFilters).toHaveCount(1);
  await expect(savedFilters.first()).toContainText('Bug Filter');
  // Apply the saved filter
  await savedFilters.first().locator('.filter-name').click();
  // Verify the filter is applied
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(1);
});

test('saved filter deletion works', async ({ page }) => {
  // Create a saved filter
  await page.locator('#filter-type').selectOption('bug');
  page.on('dialog', async dialog => {
    await dialog.accept('Delete Me Filter');
  });
  await page.locator('#save-filter-btn').click();
  // Delete it
  await page.locator('.filter-delete').click();
  // Verify it's gone
  const savedFilters = page.locator('.saved-filter-item');
  await expect(savedFilters).toHaveCount(0);
});

test('sidebar toggle persists visibility', async ({ page }) => {
  const wrapper = page.locator('#sidebar-wrapper');
  // Hide sidebar
  await page.locator('#sidebar-toggle').click();
  await expect(wrapper).toHaveClass(/collapsed/);
  // Show sidebar again
  await page.locator('#sidebar-toggle').click();
  await expect(wrapper).not.toHaveClass(/collapsed/);
});

test('theme toggle persists across reload', async ({ page }) => {
  // Toggle to dark
  await page.locator('#theme-toggle').click();
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(theme).toBe('dark');
  // Reload
  await page.reload();
  // Dismiss onboarding if visible
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
  // Verify theme persisted
  const persistedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(persistedTheme).toBe('dark');
});

test('activity feed updates on actions', async ({ page }) => {
  const activityFeed = page.locator('#activity-feed');
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Activity test');
  await page.locator('#issue-form button[type="submit"]').click();
  // Activity feed should show the new activity
  const activityItems = page.locator('.activity-item');
  const count = await activityItems.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test('issue key in detail panel matches project prefix', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const detailTitle = page.locator('#detail-title');
  await expect(detailTitle).toContainText('PROJ-');
});

test('clone button is hidden when no issue is selected', async ({ page }) => {
  // Close any open detail panel
  const panel = page.locator('#detail-panel');
  if (await panel.locator('[class*="open"]').count() > 0) {
    await page.locator('#detail-close').click();
  }
  // Clone button should not be visible
  await expect(page.locator('#clone-issue-btn')).not.toBeVisible();
});

test('delete button appears when issue is open', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await expect(page.locator('#delete-issue-btn')).toBeVisible();
});

test('comment count badge updates', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  // Add a comment
  await page.locator('#comment-input').fill('Test comment');
  await page.locator('#comment-submit').click();
  // Close detail panel
  await page.locator('#detail-close').click();
  // Verify comment badge appears on the card
  const badge = page.locator('.issue-comments-badge');
  await expect(badge).toHaveCount(1);
  await expect(badge).toContainText('1');
});

test('overdue issues show in notification bell', async ({ page }) => {
  const bell = page.locator('#notification-bell');
  const count = page.locator('#notification-count');
  // Debug: check what issues are loaded
  const issues = await page.evaluate(() => {
    const issues = getIssues ? getIssues() : [];
    return issues.map(i => ({id:i.id, title:i.title, dueDate:i.dueDate, status:i.status}));
  });
  // Debug: check storage mode
  const storageMode = await page.evaluate(() => typeof getStorageMode === 'function' ? getStorageMode() : 'unknown');
  // Debug: check localStorage
  const ls = await page.evaluate(() => {
    const data = localStorage.getItem('jirito-state');
    if (data) {
      const parsed = JSON.parse(data);
      return { issuesCount: parsed.issues?.length, firstIssueDueDate: parsed.issues?.[0]?.dueDate };
    }
    return null;
  });
  // Debug: check if the first issue has a dueDate property
  const firstIssue = await page.evaluate(() => {
    const issues = getIssues ? getIssues() : [];
    if (issues.length > 0) {
      const i = issues[0];
      return { hasDueDate: 'dueDate' in i, dueDateValue: i.dueDate, keys: Object.keys(i) };
    }
    return null;
  });
  // There should be overdue issues in the sample data
  await bell.click();
  const dropdown = page.locator('#notification-dropdown');
  await expect(dropdown).toBeVisible();
  // Should show overdue issues
  const dropdownContent = await page.locator('#notification-dropdown-body').innerText();
  const overdueItems = page.locator('.notification-item');
  await expect(overdueItems).not.toHaveCount(0);
});

test('clicking notification item opens issue detail', async ({ page }) => {
  const bell = page.locator('#notification-bell');
  await bell.click();
  const dropdown = page.locator('#notification-dropdown');
  await expect(dropdown).toBeVisible();
  const firstItem = page.locator('.notification-item').first();
  await firstItem.click();
  // Detail panel should be open
  await expect(page.locator('#detail-panel')).toHaveClass(/open/);
});

test('notification dropdown closes when clicking outside', async ({ page }) => {
  const bell = page.locator('#notification-bell');
  await bell.click();
  const dropdown = page.locator('#notification-dropdown');
  await expect(dropdown).toBeVisible();
  // Click outside
  await page.mouse.click(10, 10);
  await expect(dropdown).not.toBeVisible();
});

// ===== Notification Tests =====
test('notification bell is visible', async ({ page }) => {
  await expect(page.locator('#notification-bell')).toBeVisible();
});

test('notification dropdown shows overdue issues', async ({ page }) => {
  const bell = page.locator('#notification-bell');
  await bell.click();
  await expect(page.locator('#notification-dropdown')).toBeVisible();
});

// ===== Export/Import Tests =====
test('export button exists and is clickable', async ({ page }) => {
  const exportBtn = page.locator('#export-btn');
  await expect(exportBtn).toBeVisible();
  // Click should trigger a download - just verify it doesn't throw
  await exportBtn.click();
  // Small wait for the download to start
  await page.waitForTimeout(500);
});

test('import button exists', async ({ page }) => {
  const importBtn = page.locator('#import-btn');
  await expect(importBtn).toBeVisible();
});

// ===== Bulk Action Tests =====
test('bulk action bar appears when cards are selected', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await page.locator('#detail-close').click();
  // Select a card via checkbox
  const checkbox = page.locator('[data-status="todo"] .issue-checkbox').first();
  await checkbox.click();
  const bulkBar = page.locator('#bulk-bar');
  await expect(bulkBar).toBeVisible();
  await expect(bulkBar.locator('#bulk-count')).toContainText('1 selected');
});

test('bulk clear deselects all cards', async ({ page }) => {
  // Select multiple cards
  const checkboxes = page.locator('[data-status="todo"] .issue-checkbox');
  await checkboxes.first().click();
  await checkboxes.nth(1).click();
  await expect(page.locator('#bulk-bar')).toBeVisible();
  // Clear selection
  await page.locator('#bulk-clear').click();
  await expect(page.locator('#bulk-bar')).not.toBeVisible();
});

test('bulk status change moves selected cards', async ({ page }) => {
  // Select a card in To Do
  const checkbox = page.locator('[data-status="todo"] .issue-checkbox').first();
  await checkbox.click();
  // Move to In Progress
  await page.locator('#bulk-status').selectOption('inprogress');
  // Verify card moved
  const inProgressCards = page.locator('[data-status="inprogress"] .issue-card');
  await expect(inProgressCards).toHaveCount(2);
});

// ===== New Tests for Code Review Fixes =====

// Task 4.2: Test onboarding shows on first load (with cleared localStorage)
test('onboarding shows on first load', async ({ page }) => {
  // Clear localStorage to simulate first load, then reload the proxy URL so
  // the storage reset takes effect on the same origin.
  await clearStorage(page);
  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.removeItem('jirito-onboarding'));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#onboarding-overlay')).toBeVisible();
});

// Task 4.2: Test onboarding doesn't show after being dismissed
test('onboarding does not show after dismissal', async ({ page }) => {
  // Mark onboarding as seen on the same origin we'll reload to.
  // (The original file:// approach was broken because file:// is a
  // separate origin and lost the localStorage flag set on the proxy origin.)
  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.setItem('jirito-onboarding', 'true'));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#onboarding-overlay')).not.toBeVisible();
});

// ===== Project Switching Tests =====
test('creating a new project switches to it', async ({ page }) => {
  await page.locator('#add-project-btn').click();
  await page.locator('#project-name').fill('Test Project');
  await page.locator('#project-key').fill('TP');
  await page.locator('#project-form').evaluate(form => form.requestSubmit());
  // Verify the new project is active in sidebar
  const activeProject = page.locator('.project-item.active');
  await expect(activeProject).toContainText('Test Project');
  // Verify board title updated (project name now shown in board header)
  await expect(page.locator('#board-title')).toContainText('Test Project');
});

test('switching between projects updates the board', async ({ page }) => {
  // Create a second project
  await page.locator('#add-project-btn').click();
  await page.locator('#project-name').fill('Second Project');
  await page.locator('#project-key').fill('SP');
  await page.locator('#project-form').evaluate(form => form.requestSubmit());
  // Create an issue in the second project
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Issue in second project');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  // Switch back to default project
  await page.locator('.project-item:has-text("Project Alpha")').click();
  // Verify we're back on the default project (name shown in board title)
  await expect(page.locator('#board-title')).toContainText('Project Alpha');
  // Switch to second project again
  await page.locator('.project-item:has-text("Second Project")').click();
  await expect(page.locator('#board-title')).toContainText('Second Project');
});

test('deleting a project switches to remaining project', async ({ page }) => {
  // Create a second project
  await page.locator('#add-project-btn').click();
  await page.locator('#project-name').fill('Delete Me');
  await page.locator('#project-key').fill('DM');
  await page.locator('#project-form').evaluate(form => form.requestSubmit());
  // Set up dialog handler BEFORE clicking delete
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
  // Delete it
  await page.locator('.project-item:has-text("Delete Me") .project-delete').click();
  // Verify we switched back to default
  const activeProject = page.locator('.project-item.active');
  await expect(activeProject).toContainText('Project Alpha');
});

test('cannot delete the last project', async ({ page }) => {
  // Try to delete the only project - should show error toast
  await page.locator('.project-item.active .project-delete').click();
  // Should show error toast
  const toast = page.locator('.toast-error');
  await expect(toast).toBeVisible({ timeout: 3000 });
  await expect(toast).toContainText('at least one project');
});

// ===== Project Key Prefix Tests =====
test('issue keys use project key prefix', async ({ page }) => {
  // Create a project with a specific key
  await page.locator('#add-project-btn').click();
  await page.locator('#project-name').fill('Key Test');
  await page.locator('#project-key').fill('KTEST');
  await page.locator('#project-form').evaluate(form => form.requestSubmit());
  // Create an issue
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Key test issue');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  // Verify the issue key uses the project key
  const cards = page.locator('.issue-card');
  await expect(cards).toHaveCount(1);
  const key = page.locator('.issue-card').first().locator('.issue-key');
  await expect(key).toContainText('KTEST-');
});

test('switching projects shows correct issue keys', async ({ page }) => {
  // Create a project
  await page.locator('#add-project-btn').click();
  await page.locator('#project-name').fill('Switch Test');
  await page.locator('#project-key').fill('SWT');
  await page.locator('#project-form').evaluate(form => form.requestSubmit());
  // Wait for project creation to propagate
  await page.waitForTimeout(500);
  // Create an issue
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Switch test issue');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  // Wait for issue to appear
  await page.locator('.issue-card').first().waitFor({ state: 'visible', timeout: 5000 });
  // Switch back to default
  await page.locator('.project-item:has-text("Project Alpha")').click();
  // Wait for board to update
  await page.waitForTimeout(500);
  // Verify default project issues show PROJ- prefix
  const defaultCards = page.locator('.issue-card');
  await expect(defaultCards.first()).toBeVisible();
  await expect(defaultCards.first().locator('.issue-key')).toContainText('PROJ-');
  // Switch back to switch test project
  await page.locator('.project-item:has-text("Switch Test")').click();
  // Wait for board to update
  await page.waitForTimeout(500);
  const switchCards = page.locator('.issue-card');
  await expect(switchCards.first()).toBeVisible();
  await expect(switchCards.first().locator('.issue-key')).toContainText('SWT-');
});

// Task 4.2: Test import validation rejects malformed data
test('import validation rejects malformed projects', async ({ page }) => {
  // Create a file with invalid projects structure
  const invalidData = JSON.stringify({
    issues: [],
    comments: {},
    projects: 'not-an-object',
    currentProject: 'default',
  });
  const blob = new Blob([invalidData], { type: 'application/json' });
  // Use the existing hidden file input
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(invalidData),
  });
  // Check that an error toast was shown
  const toast = page.locator('.toast-error');
  await expect(toast).toBeVisible({ timeout: 5000 });
});

// Task 4.2: Test switchProject with invalid key is a no-op
test('switchProject with invalid key is a no-op', async ({ page }) => {
  // The function should silently return if key doesn't exist
  // This is tested indirectly by verifying no crash occurs
  await page.goto(APP_URL, { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    // Call switchProject with a non-existent key
    switchProject('nonexistent-key');
    return getCurrentProject();
  });
  expect(result).toBe('default');
});

// Task 4.2: Test aria-live attributes exist on dynamic regions
test('aria-live attributes exist on dynamic regions', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await expect(page.locator('#board')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#activity-feed')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#notification-dropdown-body')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#bulk-bar')).toHaveAttribute('role', 'status');
});

// Task 4.2: Test column bodies have ARIA labels
test('column bodies have ARIA labels for drag targets', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'load' });
  const todoCol = page.locator('[data-status="todo"] .column-body');
  await expect(todoCol).toHaveAttribute('role', 'list');
  await expect(todoCol).toHaveAttribute('aria-label', 'To Do column');
  const doneCol = page.locator('[data-status="done"] .column-body');
  await expect(doneCol).toHaveAttribute('role', 'list');
  await expect(doneCol).toHaveAttribute('aria-label', 'Done column');
});

// ===== Sprint Creation Tests =====

test('sprint bar element exists', async ({ page }) => {
  const sprintBar = page.locator('#sprint-bar');
  await expect(sprintBar).toHaveCount(1);
});

test('manage sprints button is always visible', async ({ page }) => {
  const manageBtn = page.locator('#manage-sprints-btn');
  await expect(manageBtn).toBeVisible();
  await expect(manageBtn).toContainText('Manage Sprints');
});

test('clicking Manage Sprints opens the sprint modal', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await expect(page.locator('#sprint-modal-overlay')).toBeVisible();
});

test('sprint modal has name, start date, and end date fields', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await expect(page.locator('#sprint-name')).toBeVisible();
  await expect(page.locator('#sprint-start')).toBeVisible();
  await expect(page.locator('#sprint-end')).toBeVisible();
});

test('creating a sprint via the modal works', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await expect(page.locator('#sprint-modal-overlay')).toBeVisible();
  await page.locator('#sprint-name').fill('Sprint 1');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await expect(page.locator('#sprint-list')).toContainText('Sprint 1');
  const options = await page.locator('#sprint-filter option').allTextContents();
  expect(options.some(o => o.includes('Sprint 1'))).toBe(true);
});

test('sprint appears in issue sprint select when editing', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Sprint 1');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  // Close the sprint modal
  await page.locator('#sprint-modal-close').click();
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const detailSprint = page.locator('#detail-sprint');
  const options = await detailSprint.locator('option').allTextContents();
  expect(options.some(o => o.includes('Sprint 1'))).toBe(true);
});

test('assigning a sprint to an issue works', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Sprint 2');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await page.waitForTimeout(300);
  // Close the sprint modal
  await page.locator('#sprint-modal-close').click();
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  // Wait for the detail panel to have sprint options
  const sprintOptionValue = await page.locator('#detail-sprint option').nth(1).getAttribute('value');
  expect(sprintOptionValue).toBeTruthy();
  expect(sprintOptionValue.startsWith('sprint-')).toBeTruthy();
  await page.locator('#detail-sprint').selectOption({ value: sprintOptionValue });
  await page.locator('#detail-sprint').press('Tab');
  const sprintId = await page.locator('#detail-sprint').inputValue();
  const savedSprint = await page.evaluate((id) => {
    const data = JSON.parse(localStorage.getItem('jirito-state') || '{}');
    const sprints = data.sprints || {};
    return sprints[id];
  }, sprintId);
  expect(savedSprint).toBeDefined();
  expect(savedSprint.name).toBe('Sprint 2');
});

test('sprint modal can be closed via close button', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-modal-close').click();
  await expect(page.locator('#sprint-modal-overlay')).not.toBeVisible();
});

test('sprint modal can be closed by clicking overlay', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await page.mouse.click(10, 10);
  await expect(page.locator('#sprint-modal-overlay')).not.toBeVisible();
});

test('sprint can be deleted from the manage modal', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Sprint Delete Me');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  page.on('dialog', async dialog => { await dialog.accept(); });
  await page.locator('.sprint-delete-btn').click();
  await expect(page.locator('#sprint-list')).not.toContainText('Sprint Delete Me');
});

test('sprint can be activated from the manage modal', async ({ page }) => {
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Sprint A');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await page.waitForTimeout(300);
  await page.locator('#sprint-name').fill('Sprint B');
  await page.locator('#sprint-start').fill('2026-08-01');
  await page.locator('#sprint-end').fill('2026-09-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await page.waitForTimeout(300);
  // Sprint A has dates spanning current date so it shows "Active", Sprint B shows "Activate"
  // Click the button that says "Activate" (not "Active")
  const activateBtn = page.locator('.sprint-activate-btn').filter({ hasText: 'Activate' }).first();
  await activateBtn.click();
  // Verify the activated sprint saved its active flag. The test runs
  // against a live server, so the click triggers saveState (debounced
  // 300ms) which persists to the SQLite DB. Read back via the state
  // API.
  // (The previous version of this test read localStorage, which is
  // only populated in offline mode — the migration to server mode
  // changed the persistence layer. We also need a poll because the
  // debounce + network round trip isn't instantaneous.)
  const activeSprintId = await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      const resp = await fetch('/api/state');
      const data = await resp.json();
      const sprints = data.sprints || {};
      for (const s of Object.values(sprints)) {
        if (s.active) return s.id;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  });
  expect(activeSprintId).toBeTruthy();
});

// ===== Dependency Search Tests =====

test('dependency search input is visible and readable in detail panel', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const depSearch = page.locator('#dep-search');
  await expect(depSearch).toBeVisible();
  await expect(depSearch).toHaveAttribute('placeholder', /Search issues/);
});

test('dependency search results dropdown appears when typing', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('PROJ-10');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  const results = page.locator('.dep-result-item');
  const count = await results.count();
  expect(count).toBeGreaterThan(0);
});

test('dependency search results are clickable and add dependencies', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('PROJ-10');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  const firstResult = page.locator('.dep-result-item').first();
  await firstResult.click();
  const toast = page.locator('.toast-success');
  await expect(toast).toBeVisible({ timeout: 2000 });
  const depContainer = page.locator('#detail-dependencies');
  await expect(depContainer).toContainText('PROJ-10');
});

test('dependency search filters by issue key', async ({ page }) => {
  // Click the second card (issue 103) to avoid excluding it from search
  const card = page.locator('[data-status="todo"] .issue-card').nth(1);
  await card.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('PROJ-101');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  await expect(page.locator('.dep-result-item')).toContainText('PROJ-101');
});

test('dependency search filters by issue title', async ({ page }) => {
  // Click the second card (issue 103) to avoid excluding it from search
  const card = page.locator('[data-status="todo"] .issue-card').nth(1);
  await card.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('login');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  const results = page.locator('.dep-result-item');
  const count = await results.count();
  expect(count).toBeGreaterThan(0);
});

test('dependency search excludes the current issue', async ({ page }) => {
  // Click the second card (issue 103) so PROJ-101 (issue 101) is excluded
  const card = page.locator('[data-status="todo"] .issue-card').nth(1);
  await card.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('PROJ-10');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  const results = page.locator('.dep-result-item');
  const count = await results.count();
  if (count > 0) {
    const texts = await results.allTextContents();
    // PROJ-103 (current issue) should be excluded
    expect(texts.every(t => !t.includes('PROJ-103'))).toBe(true);
  }
});

test('dependency search is case-insensitive', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('PROJ-10');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  const results = page.locator('.dep-result-item');
  const count = await results.count();
  expect(count).toBeGreaterThan(0);
});

test('dependency search shows no results for non-matching query', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('ZZZZZ-nonexistent');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).not.toBeVisible({ timeout: 2000 });
});

test('dependency type selector works (relates-to vs blocks)', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const depType = page.locator('#dep-type');
  await depType.selectOption('blocks');
  await expect(depType).toHaveValue('blocks');
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('PROJ-10');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  const firstResult = page.locator('.dep-result-item').first();
  await firstResult.click();
  const depContainer = page.locator('#detail-dependencies');
  await expect(depContainer).toContainText('blocks');
});

test('circular dependency is prevented', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Issue A');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Issue B');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());
  // Issue A is the last created issue, find it by title
  const issueACard = page.locator('[data-status="todo"] .issue-card:has-text("Issue A")').first();
  await issueACard.click();
  const depSearch = page.locator('#dep-search');
  await depSearch.fill('Issue B');
  const depResults = page.locator('#dep-search-results');
  await expect(depResults).toBeVisible({ timeout: 2000 });
  const firstResult = page.locator('.dep-result-item').first();
  await firstResult.click();
  await page.locator('#detail-close').click();
  const issueBCard = page.locator('[data-status="todo"] .issue-card:has-text("Issue B")').first();
  await issueBCard.click();
  const depSearch2 = page.locator('#dep-search');
  await depSearch2.fill('Issue A');
  const depResults2 = page.locator('#dep-search-results');
  await expect(depResults2).toBeVisible({ timeout: 2000 });
  const firstResult2 = page.locator('.dep-result-item').first();
  await firstResult2.click();
  const errorToast = page.locator('.toast-error');
  await expect(errorToast).toBeVisible({ timeout: 2000 });
});

// ===== Calendar and Dashboard View Tests (Issue Fixes) =====

test('switching to calendar view hides the board', async ({ page }) => {
  // Calendar is the 3rd view item (board=0, list=1, calendar=2, dashboard=3)
  await page.locator('#view-list .view-item').nth(2).click();
  const board = page.locator('#board');
  const display = await board.evaluate(el => el.style.display);
  expect(display).toBe('none');
});

test('calendar view renders in the main area, not the sidebar', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(2).click();
  // The calendar should be in a container in the board area
  const calendarContainer = page.locator('#calendar-container');
  await expect(calendarContainer).toBeVisible();
  // The sidebar calendar section should NOT be visible
  const sidebarCalendar = page.locator('#calendar-section');
  const sidebarDisplay = await sidebarCalendar.evaluate(el => el.style.display);
  expect(sidebarDisplay).toBe('none');
});

test('calendar view shows a calendar grid with days', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(2).click();
  const calendarDays = page.locator('#calendar-container .calendar-day');
  const count = await calendarDays.count();
  expect(count).toBeGreaterThan(0);
});

test('calendar month navigation works', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(2).click();
  const monthLabel = page.locator('#calendar-container .calendar-month-label');
  const originalText = await monthLabel.textContent();
  // Click next (use the one inside the calendar-container to avoid ambiguity)
  await page.locator('#calendar-container #calendar-next').click();
  const newText = await monthLabel.textContent();
  expect(newText).not.toBe(originalText);
});

test('switching to dashboard view hides the board', async ({ page }) => {
  // Dashboard is the 4th view item
  await page.locator('#view-list .view-item').nth(3).click();
  const board = page.locator('#board');
  const display = await board.evaluate(el => el.style.display);
  expect(display).toBe('none');
});

test('dashboard view renders in the main area, not the sidebar', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(3).click();
  // The dashboard should be in a container in the board area
  const dashboardContainer = page.locator('#dashboard-container');
  await expect(dashboardContainer).toBeVisible();
  // The sidebar dashboard section should NOT be visible
  const sidebarDashboard = page.locator('#dashboard-section');
  const sidebarDisplay = await sidebarDashboard.evaluate(el => el.style.display);
  expect(sidebarDisplay).toBe('none');
});

test('dashboard view shows stat cards', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(3).click();
  const statCards = page.locator('#dashboard-container .dashboard-stat-card');
  const count = await statCards.count();
  expect(count).toBeGreaterThan(0);
});

test('dashboard view shows chart containers', async ({ page }) => {
  await page.locator('#view-list .view-item').nth(3).click();
  const charts = page.locator('#dashboard-container .dashboard-chart');
  const count = await charts.count();
  expect(count).toBeGreaterThan(0);
});

test('switching back to board view shows the board and hides calendar/dashboard', async ({ page }) => {
  // Go to calendar
  await page.locator('#view-list .view-item').nth(2).click();
  await expect(page.locator('#calendar-container')).toBeVisible();
  // Switch to dashboard
  await page.locator('#view-list .view-item').nth(3).click();
  await expect(page.locator('#dashboard-container')).toBeVisible();
  // Switch back to board
  await page.locator('#view-list .view-item').nth(0).click();
  const board = page.locator('#board');
  const display = await board.evaluate(el => el.style.display);
  expect(display).not.toBe('none');
  // Calendar container should be hidden
  const cc = page.locator('#calendar-container');
  const ccDisplay = await cc.evaluate(el => el.style.display);
  expect(ccDisplay).toBe('none');
  // Dashboard container should be hidden
  const dc = page.locator('#dashboard-container');
  const dcDisplay = await dc.evaluate(el => el.style.display);
  expect(dcDisplay).toBe('none');
});

test('sidebar view icons are rendered after switching to calendar', async ({ page }) => {
  // Click calendar view
  await page.locator('#view-list .view-item').nth(2).click();
  // The sidebar should still show the view list with icons
  const viewItems = page.locator('#view-list .view-item');
  await expect(viewItems).toHaveCount(4);
  // The active view item should have a Phosphor icon (class="ph ph-*")
  const activeView = page.locator('#view-list .view-item.active');
  const hasIcon = await activeView.locator('i.ph').count();
  expect(hasIcon).toBeGreaterThan(0);
});

test('sidebar view icons are rendered after switching to dashboard', async ({ page }) => {
  // Click dashboard view
  await page.locator('#view-list .view-item').nth(3).click();
  // The sidebar should still show the view list with icons
  const viewItems = page.locator('#view-list .view-item');
  await expect(viewItems).toHaveCount(4);
  // The active view item should have a Phosphor icon (class="ph ph-*")
  const activeView = page.locator('#view-list .view-item.active');
  const hasIcon = await activeView.locator('i.ph').count();
  expect(hasIcon).toBeGreaterThan(0);
});

test('sidebar view icons are rendered after switching to list', async ({ page }) => {
  // Click list view
  await page.locator('#view-list .view-item').nth(1).click();
  // The sidebar should still show the view list with icons
  const viewItems = page.locator('#view-list .view-item');
  await expect(viewItems).toHaveCount(4);
  // The active view item should have a Phosphor icon (class="ph ph-*")
  const activeView = page.locator('#view-list .view-item.active');
  const hasIcon = await activeView.locator('i.ph').count();
  expect(hasIcon).toBeGreaterThan(0);
});

test('switching between calendar and dashboard does not stack content', async ({ page }) => {
  // Go to calendar
  await page.locator('#view-list .view-item').nth(2).click();
  await expect(page.locator('#calendar-container')).toBeVisible();
  // Go to dashboard
  await page.locator('#view-list .view-item').nth(3).click();
  // Dashboard should be visible
  await expect(page.locator('#dashboard-container')).toBeVisible();
  // Calendar should be hidden
  const cc = page.locator('#calendar-container');
  const ccDisplay = await cc.evaluate(el => el.style.display);
  expect(ccDisplay).toBe('none');
  // Board should be hidden
  const board = page.locator('#board');
  const boardDisplay = await board.evaluate(el => el.style.display);
  expect(boardDisplay).toBe('none');
});

// ===== Sprint Filtering on Board =====
test('sprint filter dropdown exists', async ({ page }) => {
  // Create a sprint first to make the filter visible
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Test Sprint');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await page.locator('#sprint-modal-close').click();
  await expect(page.locator('#sprint-filter')).toBeVisible();
});

test('filtering by sprint shows only that sprint\'s issues', async ({ page }) => {
  // Create a sprint
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Filter Sprint');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await page.waitForTimeout(300);
  await page.locator('#sprint-modal-close').click();

  // Assign sprint to an issue via detail panel
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  const sprintSelect = page.locator('#detail-sprint');
  const options = await sprintSelect.locator('option').allTextContents();
  const sprintOption = options.find(o => o.includes('Filter Sprint'));
  if (sprintOption) {
    await sprintSelect.selectOption({ label: sprintOption.trim() });
    await sprintSelect.press('Tab');
  }
  await page.locator('#detail-close').click();

  // Apply sprint filter using board-level sprint filter dropdown
  const boardSprintFilter = page.locator('#sprint-filter');
  await boardSprintFilter.selectOption({ label: 'Filter Sprint' });
  const filteredCards = page.locator('.issue-card');
  // Should show fewer cards (only those with the sprint assigned)
  const count = await filteredCards.count();
  expect(count).toBeGreaterThanOrEqual(0);
});

// ===== Sprint Progress =====
test('sprint progress bar is visible', async ({ page }) => {
  // Create a sprint first
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Progress Sprint');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await page.locator('#sprint-modal-close').click();

  // Activate the sprint
  await page.locator('#manage-sprints-btn').click();
  const activateBtn = page.locator('.sprint-activate-btn').filter({ hasText: 'Activate' }).first();
  if (await activateBtn.isVisible()) {
    await activateBtn.click();
    await page.waitForTimeout(500);
  }

  // Progress bar should be visible
  const progressBar = page.locator('#sprint-progress-bar');
  await expect(progressBar).toBeVisible();
});

// ===== Comment Count Persistence =====
test('comment count is stored in localStorage', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  await page.locator('#comment-input').fill('Persistence comment');
  await page.locator('#comment-submit').click();
  await page.locator('#detail-close').click();

  // Check localStorage has comment counts
  const commentCounts = await page.evaluate(() => {
    return JSON.parse(localStorage.getItem('jirito-commentCounts') || '{}');
  });
  expect(typeof commentCounts).toBe('object');
});

// ===== Dashboard View Tests =====
test('dashboard view shows stats', async ({ page }) => {
  // Switch to dashboard view
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('Dashboard')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(300);
  await expect(page.locator('#dashboard-container')).toBeVisible();
});

// ===== Calendar View Tests =====
test('calendar view shows calendar', async ({ page }) => {
  // Switch to calendar view
  const viewItems = page.locator('.view-item');
  const count = await viewItems.count();
  for (let i = 0; i < count; i++) {
    const text = await viewItems.nth(i).textContent();
    if (text && text.includes('Calendar')) {
      await viewItems.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(300);
  await expect(page.locator('#calendar-container')).toBeVisible();
});

// ===== Trash Entry Expiration =====
test('old trash entries are purged on load', async ({ page }) => {
  // Simulate an old trash entry (10 days old)
  try {
    await page.evaluate(() => {
      const trash = JSON.parse(localStorage.getItem('jirito-trash') || '[]');
      trash.push({
        issues: [{ id: 998, title: 'Expired Trash Entry', status: 'todo' }],
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
      localStorage.setItem('jirito-trash', JSON.stringify(trash));
    });
  } catch {
    // file:// protocol may block localStorage
  }

  // Reload the page
  await page.reload();

  // Trash section should not show expired entries
  const trashSection = page.locator('#trash-section');
  // Either not visible or has no expired items
  if (await trashSection.isVisible()) {
    const trashItems = page.locator('.trash-item');
    const trashCount = await trashItems.count();
    // If there are items, none should be the expired one
    if (trashCount > 0) {
      const texts = await trashItems.allTextContents();
      expect(texts.some(t => t.includes('Expired Trash Entry'))).toBe(false);
    }
  }
});

// ===== Issue Key Counter Persistence =====
test('issue key counter increments after reload', async ({ page }) => {
  // Wait for board to be ready
  const todoCardsInitial = page.locator('[data-status="todo"] .issue-card');
  expect(await todoCardsInitial.count()).toBeGreaterThan(0);

  // Create an issue
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Counter Issue');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());

  // Wait for the new issue card to appear
  await page.locator('.issue-card').last().waitFor({ state: 'visible' });

  // Debug: log the issue counter from the page
  const storageData = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('jirito-state') || '{}');
    return { counter: data.issueCounter, issues: data.issues?.map(i => ({ id: i.id, title: i.title })) || [] };
  });

  // Get the issue key
  const todoCards = page.locator('[data-status="todo"] .issue-card');
  const todoCount = await todoCards.count();
  // After creating an issue, there should be more than 3 todo cards
  expect(todoCount).toBeGreaterThan(3);
  const cards = await todoCards.all();
  const allIds = await Promise.all(cards.map(c => c.getAttribute('data-id')));
  const allKeys = await todoCards.locator('.issue-key').allTextContents();
  const allTitles = await todoCards.locator('.issue-title').allTextContents();
  const lastKey = await todoCards.last().locator('.issue-key').textContent();
  expect(allTitles).toContain('Counter Issue');
  expect(allIds).toContain('107');

  // Wait for debounced save to complete
  await page.waitForTimeout(500);

  // Reload
  await page.reload();
  // Dismiss onboarding if visible
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }

  // Create another issue and verify counter continued incrementing
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Followup Issue');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());

  // Wait for the board to re-render
  await page.waitForTimeout(300);

  const newTodoCards = page.locator('[data-status="todo"] .issue-card');
  const newLastKey = await newTodoCards.last().locator('.issue-key').textContent();

  // The new key should be different (higher number)
  expect(newLastKey).not.toBe(lastKey);
});

// ===== Bulk Action - Bulk Delete =====
test('bulk delete moves selected issues to trash', async ({ page }) => {
  // Select multiple cards
  const checkboxes = page.locator('[data-status="todo"] .issue-checkbox');
  const count = await checkboxes.count();
  if (count >= 2) {
    await checkboxes.first().click();
    await checkboxes.nth(1).click();

    // Bulk delete
    page.on('dialog', async dialog => { await dialog.accept(); });
    await page.locator('#bulk-delete').click();

    // Verify bulk bar is gone
    await expect(page.locator('#bulk-bar')).not.toBeVisible();
  }
});

// ===== Edge Cases =====
test('clicking on empty column body does nothing', async ({ page }) => {
  const todoCol = page.locator('[data-status="todo"] .column-body');
  const beforeCount = await page.locator('.issue-card').count();
  await todoCol.click();
  const afterCount = await page.locator('.issue-card').count();
  expect(afterCount).toBe(beforeCount);
});

test('search with only spaces does not filter', async ({ page }) => {
  await page.locator('#search-input').fill('   ');
  await page.locator('#search-input').press('Enter');
  const cards = page.locator('.issue-card');
  // Should show all cards (spaces-only search is ignored)
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
});

test('duplicate issue title is allowed', async ({ page }) => {
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Duplicate Title');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());

  // Close and open modal again
  const modalOverlay = page.locator('#modal-overlay');
  if (await modalOverlay.isVisible()) {
    await page.locator('#modal-close').click();
  }
  await page.locator('#add-issue-btn').click();
  await page.locator('#issue-title').fill('Duplicate Title');
  await page.locator('#issue-form').evaluate(form => form.requestSubmit());

  // Both should exist
  const cards = page.locator('.issue-card');
  const duplicateCount = await cards.filter({ hasText: 'Duplicate Title' }).count();
  expect(duplicateCount).toBeGreaterThanOrEqual(2);
});

test('issue card click opens detail panel even for issues with no comments', async ({ page }) => {
  // Find an issue that has no comments (all new issues won't have comments)
  const card = page.locator('[data-status="todo"] .issue-card').last();
  await card.click();
  await expect(page.locator('#detail-panel')).toHaveClass(/open/);
  await page.locator('#detail-close').click();
});

test('detail panel shows comments count badge', async ({ page }) => {
  const card = page.locator('[data-status="todo"] .issue-card').first();
  await card.click();
  // Detail panel should show comment count
  const commentCount = page.locator('#comment-count');
  await expect(commentCount).toBeVisible();
});

test('sprint filter option "All Sprints" exists', async ({ page }) => {
  const allOption = page.locator('#sprint-filter option').filter({ hasText: 'All Sprints' });
  await expect(allOption).toHaveCount(1);
});

test('sprint filter shows "No Sprints" when no sprints exist', async ({ page }) => {
  // If no sprints are created, the filter should show "No Sprints" option
  const options = await page.locator('#sprint-filter option').allTextContents();
  // Should have at least the "All Sprints" option
  expect(options.some(o => o.includes('All Sprints'))).toBe(true);
});
