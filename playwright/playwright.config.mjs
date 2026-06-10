import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  testDir: '../tests',
  testMatch: '**/*.spec.mjs',
  testIgnore: [
    '**/*.test.ts',
    '**/*.test.js',
    // Exclude scratch debug specs that duplicate the heavy beforeEach
    // (50+ extra test runs adding noise + network load to the suite).
    '**/debug-*.spec.mjs',
    // Exclude Node.js test runner files. These are meant to be run with
    // `node --test ...` (not Playwright). When Playwright's `*.spec.mjs`
    // glob matches them, the `node:test` describe/it are no-ops, but the
    // top-level awaits still run, polluting the shared SQLite DB with
    // their own fixture data between real Playwright tests.
    '**/server.spec.mjs',
    '**/storage.spec.mjs',
  ],
  globalSetup: './playwright-global-setup.mjs',
  globalTeardown: './playwright-global-teardown.mjs',
  reporter: 'list',
  forbidOnly: false,
  fullyParallel: false,
  workers: 1,
  use: {
    viewport: { width: 1440, height: 900 },
  },
});
