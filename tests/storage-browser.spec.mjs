// ===== Storage Abstraction Layer — Browser Tests (Phase 4) =====
// Tests for src/storage.js client-side behavior in the browser.
// Run with: npm test -- --grep "storage"
//
// These tests verify:
//   - storage.js is loaded as a global IIFE (window.storage)
//   - initStorage() detects server and sets mode
//   - getStorageData() returns the correct initial state
//   - saveStorageData() persists data through the server API
//   - localStorage fallback works when server is unavailable
//   - State persistence across page reloads

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '..', 'index.html');
const indexDir = path.dirname(indexPath);

// Helper to clear localStorage safely
async function clearStorage(page) {
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {
    // protocol may block localStorage access
  }
}

// Helper to navigate to the app
async function navigate(page) {
  await clearStorage(page);
  await page.goto('http://127.0.0.1:8080/');
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }
}

// ===== Storage IIFE Tests =====

test('storage.js exposes window.storage as a global object', async ({ page }) => {
  await navigate(page);
  const hasStorage = await page.evaluate(() => typeof window.storage !== 'undefined');
  expect(hasStorage).toBe(true);
});

test('window.storage has initStorage method', async ({ page }) => {
  await navigate(page);
  const hasInitStorage = await page.evaluate(() => typeof window.storage.initStorage === 'function');
  expect(hasInitStorage).toBe(true);
});

test('window.storage has getStorageType method', async ({ page }) => {
  await navigate(page);
  const hasGetStorageType = await page.evaluate(() => typeof window.storage.getStorageType === 'function');
  expect(hasGetStorageType).toBe(true);
});

test('window.storage has getStorageData method', async ({ page }) => {
  await navigate(page);
  const hasGetStorageData = await page.evaluate(() => typeof window.storage.getStorageData === 'function');
  expect(hasGetStorageData).toBe(true);
});

test('window.storage has saveStorageData method', async ({ page }) => {
  await navigate(page);
  const hasSaveStorageData = await page.evaluate(() => typeof window.storage.saveStorageData === 'function');
  expect(hasSaveStorageData).toBe(true);
});

test('storage.js is loaded as an ES module', async ({ page }) => {
  // After the phase-5 migration, every client script is loaded as an
  // ES module (the legacy classic-script load would have polluted
  // window.* and broken strict-mode type checks). This test replaced
  // the previous 'storage.js does not use ESM export syntax' test,
  // which was asserting the old architecture.
  await page.goto('http://127.0.0.1:8080/');
  await page.waitForTimeout(1000); // Let scripts load
  const content = await page.content();
  // The storage module script tag exists and is loaded as a module.
  expect(content).toMatch(/<script[^>]+src="src\/storage\.js"[^>]*>/);
  // Every <script> in the document is type="module" post-phase-5.
  expect(content).toMatch(/<script type="module" src="src\/storage\.js"/);
});

// ===== Storage Mode Detection Tests =====

test('storage mode is detected as "server" when server is available', async ({ page }) => {
  await navigate(page);
  // initStorage should auto-detect server availability
  const mode = await page.evaluate(async () => {
    await window.storage.initStorage();
    return window.storage.getStorageType();
  });
  expect(mode).toBe('server');
});

test('storage mode is "offline" when server is unavailable', async ({ page }) => {
  await navigate(page);
  // Force server detection to fail by blocking /api/health
  await page.route('**/api/health', route => route.abort('failed'));
  await page.route('**/api/state', route => route.abort('failed'));

  const mode = await page.evaluate(async () => {
    await window.storage.initStorage();
    return window.storage.getStorageType();
  });
  expect(mode).toBe('offline');
});

// ===== getStorageData Tests =====

test('getStorageData returns initial state with correct structure', async ({ page }) => {
  await navigate(page);
  const data = await page.evaluate(async () => {
    await window.storage.initStorage();
    return window.storage.getStorageData();
  });

  expect(Array.isArray(data.issues)).toBe(true);
  expect(typeof data.projects).toBe('object');
  expect(typeof data.currentProject).toBe('string');
  expect(Array.isArray(data.savedFilters)).toBe(true);
  expect(Array.isArray(data.activityLog)).toBe(true);
  expect(Array.isArray(data.trash)).toBe(true);
  expect(typeof data.sprints).toBe('object');
});

test('getStorageData returns issues from server when in server mode', async ({ page }) => {
  await navigate(page);
  const data = await page.evaluate(async () => {
    await window.storage.initStorage();
    return window.storage.getStorageData();
  });

  // Issues may be empty if no issues exist in the DB yet
  expect(Array.isArray(data.issues)).toBe(true);
});

// ===== saveStorageData Tests =====

test('saveStorageData persists data to server when in server mode', async ({ page }) => {
  await navigate(page);

  // Add a sprint via storage layer
  const result = await page.evaluate(async () => {
    await window.storage.initStorage();
    const data = window.storage.getStorageData();
    data.sprints['sprint-browser-test'] = {
      id: 'sprint-browser-test',
      name: 'Browser Test Sprint',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-07-15T00:00:00.000Z',
      active: false,
      archived: false,
    };
    return window.storage.saveStorageData(data);
  });

  // Verify the sprint was saved to the server by fetching state
  const stateRes = await page.evaluate(async () => {
    const res = await fetch('/api/state');
    return res.json();
  });

  expect(stateRes.sprints).toBeDefined();
  expect(stateRes.sprints['sprint-browser-test']).toBeDefined();
  expect(stateRes.sprints['sprint-browser-test'].name).toBe('Browser Test Sprint');
});

test('saveStorageData with custom columns persists to server', async ({ page }) => {
  await navigate(page);

  const result = await page.evaluate(async () => {
    await window.storage.initStorage();
    const data = window.storage.getStorageData();
    data.columns = [
      { id: 'custom-browser-test', name: 'Browser Test Column', query: { status: 'custom' }, sortOrder: 1 },
    ];
    return window.storage.saveStorageData(data);
  });

  // Verify custom columns were saved
  const stateRes = await page.evaluate(async () => {
    const res = await fetch('/api/state');
    return res.json();
  });

  expect(stateRes.columns).toBeDefined();
  expect(stateRes.columns.some(c => c.id === 'custom-browser-test')).toBe(true);
});

// ===== localStorage Fallback Tests =====

test('storage falls back to localStorage when server is unavailable', async ({ page }) => {
  await navigate(page);

  // Block server requests to force offline mode
  await page.route('**/api/health', route => route.abort('failed'));
  await page.route('**/api/state', route => route.abort('failed'));

  // Initialize in offline mode
  await page.evaluate(async () => {
    await window.storage.initStorage();
  });

  // Save data in offline mode
  const saved = await page.evaluate(async () => {
    await window.storage.initStorage();
    const data = window.storage.getStorageData();
    data.projects['offline-test'] = {
      name: 'Offline Test',
      key: 'OT',
      icon: '🔒',
      color: '#666',
      description: 'Created in offline mode',
      issues: [],
    };
    return window.storage.saveStorageData(data);
  });

  // Verify data was saved to localStorage
  const stored = await page.evaluate(() => {
    return localStorage.getItem('jirito-state');
  });

  expect(stored).toBeTruthy();
  const parsed = JSON.parse(stored);
  expect(parsed.projects['offline-test']).toBeDefined();
  expect(parsed.projects['offline-test'].name).toBe('Offline Test');
});

test('localStorage data is loaded on init when server is unavailable', async ({ page }) => {
  await navigate(page);

  // First, save some data to localStorage directly
  await page.evaluate(() => {
    localStorage.setItem('jirito-state', JSON.stringify({
      issues: [],
      projects: { 'local-test': { name: 'Local Test', key: 'LT', icon: '📦', color: '#333', description: '', issues: [] } },
      currentProject: 'local-test',
      savedFilters: [],
      activityLog: [],
      issueCounter: 2000,
      trash: [],
      sprints: {},
      columns: [],
    }));
  });

  // Block server to force offline mode
  await page.route('**/api/health', route => route.abort('failed'));
  await page.route('**/api/state', route => route.abort('failed'));

  // Load data in offline mode
  const data = await page.evaluate(async () => {
    await window.storage.initStorage();
    return window.storage.getStorageData();
  });

  expect(data.currentProject).toBe('local-test');
  expect(data.projects['local-test']).toBeDefined();
  expect(data.projects['local-test'].name).toBe('Local Test');
  expect(data.issueCounter).toBe(2000);
});

// ===== State Persistence Tests =====

test('state persists across page reloads', async ({ page }) => {
  await navigate(page);

  // Create a sprint via the app
  await page.locator('#manage-sprints-btn').click();
  await page.locator('#sprint-name').fill('Persist Test Sprint');
  await page.locator('#sprint-start').fill('2026-06-01');
  await page.locator('#sprint-end').fill('2026-07-15');
  await page.locator('#sprint-form button[type="submit"]').click();
  await page.locator('#sprint-modal-close').click();

  // Verify the sprint appears in the modal
  await page.locator('#manage-sprints-btn').click();
  await expect(page.locator('#sprint-list')).toContainText('Persist Test Sprint');
  await page.locator('#sprint-modal-close').click();

  // Reload the page
  await page.reload();
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  const onboarding = page.locator('#onboarding-overlay');
  if (await onboarding.isVisible()) {
    await page.locator('#onboarding-skip').click();
  }

  // Verify the sprint still exists after reload
  await page.locator('#manage-sprints-btn').click();
  await expect(page.locator('#sprint-list')).toContainText('Persist Test Sprint');
  await page.locator('#sprint-modal-close').click();
});

test('custom columns persist across page reloads', async ({ page }) => {
  await navigate(page);

  // Set up a custom column
  await page.evaluate(async () => {
    await window.storage.initStorage();
    const data = window.storage.getStorageData();
    data.columns = [
      { id: 'custom-persist', name: 'Custom Persist Column', query: { status: 'custom' }, sortOrder: 1 },
    ];
    await window.storage.saveStorageData(data);
  });

  // Wait for server save to complete
  await page.waitForTimeout(500);

  // Verify columns were saved to server by calling getState directly
  const serverState = await page.evaluate(async () => {
    const resp = await fetch('/api/state');
    return resp.json();
  });
  console.log('Server state columns:', JSON.stringify(serverState.columns));

  // Reload
  await page.reload();
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  // Verify custom columns still exist
  const result = await page.evaluate(async () => {
    // First try direct fetch to verify server has columns
    const resp = await fetch('/api/state');
    const serverData = await resp.json();
    
    await window.storage.initStorage();
    const data = window.storage.getStorageData();
    return { 
      columns: data.columns, 
      serverColumns: serverData.columns,
      storageType: window.storage.getStorageType()
    };
  });
  console.log('After reload, columns:', JSON.stringify(result.columns));
  console.log('After reload, serverColumns:', JSON.stringify(result.serverColumns));
  console.log('After reload, storageType:', result.storageType);
  const columns = result.columns;

  expect(columns).toBeDefined();
  expect(Array.isArray(columns)).toBe(true);
  expect(columns.some(c => c && c.id === 'custom-persist')).toBe(true);
  expect(columns.some(c => c && c.name === 'Custom Persist Column')).toBe(true);
});

// ===== Offline → Online Transition Tests =====

test('storage re-detects server availability after init', async ({ page }) => {
  await navigate(page);

  // Block server to force offline mode
  await page.route('**/api/health', route => route.abort('failed'));

  await page.evaluate(async () => {
    await window.storage.initStorage();
  });

  let mode = await page.evaluate(() => window.storage.getStorageType());
  expect(mode).toBe('offline');

  // Now unblock server and re-init
  await page.unroute('**/api/health');
  await page.unroute('**/api/state');

  await page.evaluate(async () => {
    await window.storage.initStorage();
  });

  mode = await page.evaluate(() => window.storage.getStorageType());
  expect(mode).toBe('server');
});

// ===== Error Handling Tests =====

test('saveStorageData handles server errors gracefully in offline mode', async ({ page }) => {
  await navigate(page);

  // Block server to force offline mode
  await page.route('**/api/health', route => route.abort('failed'));

  let saved = false;
  page.on('request', request => {
    if (request.url().includes('jirito-state')) {
      saved = true;
    }
  });

  await page.evaluate(async () => {
    await window.storage.initStorage();
    const data = window.storage.getStorageData();
    data.projects['error-test'] = {
      name: 'Error Test',
      key: 'ET',
      icon: '⚠️',
      color: '#FF0000',
      description: 'Test',
      issues: [],
    };
    await window.storage.saveStorageData(data);
  });

  // Should have saved to localStorage (not thrown)
  const stored = await page.evaluate(() => localStorage.getItem('jirito-state'));
  expect(stored).toBeTruthy();
  const parsed = JSON.parse(stored);
  expect(parsed.projects['error-test']).toBeDefined();
});

test('getStorageData returns empty state when no data exists', async ({ page }) => {
  await clearStorage(page);

  // Block server to force offline mode with no localStorage data
  await page.route('**/api/health', route => route.abort('failed'));

  // After the phase-5 migration, the page uses <script type="module">,
  // which Chromium refuses to load from file://. Use the http static
  // server (same as the rest of the suite) instead.
  await page.goto('http://127.0.0.1:8080/');
  // The list-view nav item should be present once the page boots.
  await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });

  const data = await page.evaluate(async () => {
    await window.storage.initStorage();
    return window.storage.getStorageData();
  });

  // Should return default empty state
  expect(Array.isArray(data.issues)).toBe(true);
  expect(typeof data.projects).toBe('object');
  expect(typeof data.currentProject).toBe('string');
});
