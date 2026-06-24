// Shared state between global setup and teardown
let staticServer = null;
let backendProc = null;
// Test-context is populated by global setup so spec files can import
// getTestContext() and learn the test backend's port + DB path without
// hardcoding them. Default to the canonical test port (3002) and DB
// path (/tmp/jirito-test.db) so standalone helpers/seed runs that
// bypass the playwright setup still get sane defaults.
let testContext = { testPort: '3002', testDbPath: '/tmp/jirito-test.db' };

export function setServers(server, proc, ctx) {
  staticServer = server;
  backendProc = proc;
  if (ctx) testContext = { ...testContext, ...ctx };
}

export function getServers() {
  return { staticServer, backendProc, ...testContext };
}

export function setTestContext(ctx) {
  testContext = { ...testContext, ...ctx };
}

export function getTestContext() {
  return { ...testContext };
}
