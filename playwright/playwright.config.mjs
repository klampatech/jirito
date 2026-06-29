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
    // X-Jirito-Silent: 1 — see server/webhooks.ts isSilentRequest(). The
    // dispatcher wraps the request handler in runSilent() when this
    // header is present, so server-side emitEvent() and broadcastEvent()
    // both early-return WITHOUT writing a webhook_outbox row or POSTing
    // to the bridge. Result: zero Discord wakes from test fixtures.
    //
    // Why global instead of per-spec: tests/helpers.mjs already exports
    // TEST_HEADERS for direct API calls (server.spec.mjs, storage.spec.mjs,
    // jirito-120-121-122-123.spec.mjs, etc.) — but browser-UI flows in
    // e2e.spec.mjs and tests.spec.mjs make fetch() calls from the page
    // context, not the test runner. TEST_HEADERS doesn't reach them.
    // `use.extraHTTPHeaders` is the only mechanism that gets the header
    // onto page-originated requests (Playwright attaches it to every
    // request issued from any page in the test browser context).
    //
    // 2026-06-29 fix: prevent the "[JIRITO TRIAGE] #107: Issue A /
    // Counter Issue" leaks into #operations that started appearing
    // when Playwright e2e tests created tickets via the UI without
    // setting the silent header at the page level. See also
    // hermes-patches/plugins/jirito-event-injector for the
    // instance_id defense-in-depth that filters any events the
    // header somehow misses (e.g., a future test that overrides
    // `use.extraHTTPHeaders`).
    extraHTTPHeaders: {
      'X-Jirito-Silent': '1',
    },
  },
});
