import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'tests.spec.mjs',
  use: {
    baseURL: 'file:///Users/kylelampa/Development/little-coder/jira-clone/index.html',
  },
});
