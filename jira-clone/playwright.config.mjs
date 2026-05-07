import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  testDir: '/Users/kylelampa/Development/little-coder/jira-clone',
  testMatch: 'tests.spec.mjs',
  testIgnore: ['**/node_modules/**', '**/*.test.ts', '**/*.test.js', '**/*.config.js', '**/playwright-global-setup.mjs', '**/screenshot*.mjs', '**/playwright*.js', '**/playwright*.mjs', 'pw.config.mjs'],
  globalSetup: './playwright-global-setup.mjs',
  reporter: 'list',
  forbidOnly: false,
  fullyParallel: false,
  workers: 1,
  use: {
    viewport: { width: 1440, height: 900 },
  },
});
