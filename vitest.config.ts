// vitest.config.ts
//
// Vitest unit-test config. Scopes the runner to `tests/unit/**/*.test.ts`
// so we don't accidentally pick up the Playwright `.spec.mjs` files
// (which use `test()` from `@playwright/test`, not `vitest`'s runner).
//
// `environment: "jsdom"` is required because the helpers we're testing
// (utils.ts) read `document` (via `escapeHtml`) at runtime and the
// `attach()` shim writes to `window`. We need both globals present
// before any test file imports `src/utils.ts`.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    // Exclude the Playwright tree entirely — vitest's default matcher
    // would otherwise try to run them and fail (different `test()` API).
    exclude: [
      "node_modules",
      "dist",
      "tests/**/*.spec.mjs",
      "tests/**/helpers.mjs",
      "playwright-report",
      "test-results",
    ],
  },
});
