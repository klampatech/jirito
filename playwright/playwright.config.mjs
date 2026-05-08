import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  testDir: '../tests',
  testMatch: '**/*.spec.mjs',
  testIgnore: ['**/*.test.ts', '**/*.test.js'],
  globalSetup: './playwright-global-setup.mjs',
  reporter: 'list',
  forbidOnly: false,
  fullyParallel: false,
  workers: 1,
  use: {
    viewport: { width: 1440, height: 900 },
  },
});
