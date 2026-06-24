// tests/helpers.isolation.test.mjs
//
// Regression test for the JIRITO-101 production-DB-wipe bug.
//
// Background: tests/helpers.mjs:clearDb() used to PUT /api/state with empty
// data against http://127.0.0.1:3001 — the LIVE jirito server, on the LIVE
// SQLite DB at ./jirito.db. Every test run wiped production tickets.
// playwright-global-setup.mjs made it worse by SIGKILLing whatever was on
// port 3001 (Kyle's running jirito.service) and re-spawning a test server
// on the same port pointed at the same DB.
//
// These assertions lock in the fix: tests must run against an isolated
// server/DB pair, not the live one. Run with:
//
//   node --test tests/helpers.isolation.test.mjs
//
// Patterns are intentionally code-specific (require quotes, semicolons,
// parens, identifier boundaries) so they match actual invocations and not
// documentation that happens to mention the port number.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const helpersPath = join(__dirname, 'helpers.mjs');
const setupPath = join(repoRoot, 'playwright', 'playwright-global-setup.mjs');
const teardownPath = join(repoRoot, 'playwright', 'playwright-global-teardown.mjs');
const sharedPath = join(repoRoot, 'playwright', 'playwright-shared.mjs');
const pkgPath = join(repoRoot, 'package.json');

describe('Test isolation: tests must not touch the live jirito DB', () => {
  it('helpers.mjs does not hardcode the live jirito URL (http://127.0.0.1:3001)', () => {
    assert.ok(existsSync(helpersPath), 'helpers.mjs must exist');
    const src = readFileSync(helpersPath, 'utf8');

    // Require the URL inside quotes (real string literal) so doc comments
    // like "// uses port 3001" don't trip the assertion.
    assert.doesNotMatch(
      src,
      /['"`]https?:\/\/(?:127\.0\.0\.1|localhost):3001/,
      'helpers.mjs must not hardcode http://127.0.0.1:3001 — tests must not target the live jirito server'
    );
  });

  it('playwright-global-setup.mjs does not kill the live jirito server', () => {
    assert.ok(existsSync(setupPath), 'playwright-global-setup.mjs must exist');
    const src = readFileSync(setupPath, 'utf8');

    // killOnPort(3001) as an actual call (followed by `;`). Documentation
    // comments that mention this string don't end with `;` so they don't match.
    assert.doesNotMatch(
      src,
      /killOnPort\s*\(\s*3001\s*\)\s*;/,
      'global setup must not call killOnPort(3001) — that kills the live jirito server'
    );
  });

  it('playwright-global-setup.mjs spawns the test backend on a non-live port', () => {
    const src = readFileSync(setupPath, 'utf8');

    // SERVER_PORT must NOT be set to 3001 in the spawn env (would conflict
    // with the live server).
    assert.doesNotMatch(
      src,
      /SERVER_PORT['"]?\s*[:=]\s*['"]?3001\b/,
      'global setup must not bind the test backend to port 3001 — that conflicts with the live server'
    );
  });

  it('playwright-global-setup.mjs sets JIRITO_DB_PATH so the test server uses an isolated DB', () => {
    const src = readFileSync(setupPath, 'utf8');

    // env passed to spawn must include JIRITO_DB_PATH (without it, the
    // server falls back to ./jirito.db — the live one).
    assert.match(
      src,
      /\bJIRITO_DB_PATH\b/,
      'global setup must reference JIRITO_DB_PATH so the test backend cannot touch ./jirito.db'
    );
  });

  it('playwright-global-setup.mjs routes the static-server /api proxy to the test backend (not 3001)', () => {
    const src = readFileSync(setupPath, 'utf8');

    // The static server on 8080 proxies /api/* to the backend. If the test
    // backend is on a non-3001 port, this proxy must follow. Require the
    // URL inside a template-string or quoted form so comments are skipped.
    assert.doesNotMatch(
      src,
      /['"`]https?:\/\/(?:127\.0\.0\.1|localhost):3001/,
      'global setup must not route /api to port 3001 — it must point at the test backend'
    );
  });

  it('playwright-global-teardown.mjs cleans up the test DB', () => {
    assert.ok(existsSync(teardownPath), 'playwright-global-teardown.mjs must exist');
    const src = readFileSync(teardownPath, 'utf8');

    // Best-effort: we don't pin to a specific filename, but teardown should
    // at least reference unlinking something DB-shaped so a stale file
    // doesn't accumulate across runs.
    assert.match(
      src,
      /\b(?:unlink|unlinkSync|rm|rmSync)\b/,
      'teardown should remove the test DB file so stale fixtures do not accumulate'
    );
  });

  it('playwright-shared.mjs exposes a test-context API so spec files can find the test port', () => {
    assert.ok(existsSync(sharedPath), 'playwright-shared.mjs must exist');
    const src = readFileSync(sharedPath, 'utf8');

    // Spec files import getTestContext() to learn the test backend's port
    // (3002 by default). Without this, the only way to know the port is
    // hardcoding it.
    assert.match(
      src,
      /\b(?:getTestContext|setTestContext)\b/,
      'shared module must export a test-context API for spec files to discover the test port'
    );
  });

  it('package.json has a test:isolation script and runs it as pretest', () => {
    assert.ok(existsSync(pkgPath), 'package.json must exist');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    assert.ok(
      pkg.scripts && pkg.scripts['test:isolation'],
      'package.json must define a test:isolation script that runs this regression test'
    );
    assert.strictEqual(
      pkg.scripts && pkg.scripts.pretest,
      'npm run test:isolation',
      'pretest must invoke test:isolation so `npm test` blocks if isolation invariants regress'
    );
  });
});