/**
 * ORCA-122 — Test dispatch wake with ORCA projectKey.
 *
 * AC: Verify that formatting.py renders ORCA-122 correctly (not JIRITO-122)
 *     when projectKey=ORCA is present in the payload.
 *
 * Evidence sources:
 *   1. Wiretap log entry for event 9efeaff2-88a4-449d-b5f5-543fce6f3dd8
 *      (jirito-event-injector received and routed ORCA-122 to ernie)
 *   2. test_project_key.py — unit-level invariants pass
 *   3. This file — end-to-end wiretap replay + jest-compatible assertions
 *
 * Run:
 *   cd /home/kyle/Development/jirito
 *   node tests/orca-122-project-key.test.mjs
 */

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';

const WIRETAP_LOG = `${process.env.HOME}/.hermes/logs/jirito-event-injector-wiretap.log`;
const PLUGIN_DIR = `${process.env.HOME}/.hermes/plugins/jirito-event-injector`;
const TEST_PROJECT_KEY = `${PLUGIN_DIR}/test_project_key.py`;

// ── AC1: Wiretap trace ────────────────────────────────────────────────────────
// Event 9efeaff2 arrived at jirito-event-injector with projectKey=ORCA.
// Verify it shows "received" + "routed_dispatch" + "routed_fyi" +
// "queued_inbox_fallback" for ernie, then discord_fyi_sent (200).
function readWiretap() {
  try {
    return readFileSync(WIRETAP_LOG, 'utf8');
  } catch {
    return '';
  }
}

const wiretap = readWiretap();
const ORCA122_EVENT_ID = '9efeaff2-88a4-449d-b5f5-543fce6f3dd8';

const checks = {
  received:      wiretap.includes(`"event_id": "${ORCA122_EVENT_ID}"`) &&
                 wiretap.includes(`"action": "received"`),
  routed_dispatch: wiretap.includes(`"action": "routed_dispatch"`) &&
                   wiretap.includes(`"assignee": "ernie"`),
  routed_fyi:     wiretap.includes(`"action": "routed_fyi"`) &&
                  wiretap.includes(`"assignee": "ernie"`),
  inbox_fallback: wiretap.includes(`"action": "queued_inbox_fallback"`) &&
                  wiretap.includes(`/inbox/ernie.jsonl"`),
  discord_fyi:    wiretap.includes(`"action": "discord_fyi_sent"`) &&
                  wiretap.includes(`"status": 200`),
  projectKey_ORCA: wiretap.includes(`"projectKey": "ORCA"`),
  no_JIRITO_122:  !wiretap.includes('JIRITO-122'),
};

console.log('\n=== ORCA-122 Wiretap Trace ===');
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);
}

// ── AC2: Python unit test ─────────────────────────────────────────────────────
// Run the existing project-key unit test suite; ORCA-122 section is [10].
console.log('\n=== test_project_key.py (all 9 groups + ORCA-122 section) ===');
const result = spawnSync('python3', [TEST_PROJECT_KEY], {
  encoding: 'utf8',
  cwd: PLUGIN_DIR,
});

if (result.status !== 0) {
  console.error('STDOUT:', result.stdout);
  console.error('STDERR:', result.stderr);
  process.exit(1);
}

// Print the last 30 lines (includes the summary)
// Find the ORCA-122 section
const lines = result.stdout.split('\n');
const orcaIdx = lines.findIndex(l => l.includes('[10] ORCA-122'));
const orcaSection = orcaIdx >= 0
  ? lines.slice(orcaIdx).join('\n')
  : lines.slice(-30).join('\n');
console.log(orcaSection);

// ── AC3: format_dispatch_wake renders ORCA-122 (not JIRITO-122) ─────────────
// Invoked inline via node -e + python shim to avoid a full ESM import chain.
console.log('\n=== AC3: format_dispatch_wake ORCA-122 verification ===');
const verifyWake = `
import sys; sys.path.insert(0, '${PLUGIN_DIR}')
from formatting import format_dispatch_wake
payload = {
    'id': 122,
    'title': 'ORCA-KEY-FULL-PROBE',
    'assignee': 'ernie',
    'description': 'Test dispatch wake with ORCA projectKey',
    'projectKey': 'ORCA',
    'labels': [],
}
wake = format_dispatch_wake(payload)
checks = {
    'ORCA-122 in wake':       'ORCA-122' in wake,
    'fix/orca-122- in wake': 'fix/orca-122-' in wake,
    'JIRITO-122 NOT in wake': 'JIRITO-122' not in wake,
    'title in wake':          'ORCA-KEY-FULL-PROBE' in wake,
    'branch hygiene clean':    'ORCA-122' in wake and 'branch scope clean' in wake,
}
for k, v in checks.items():
    print(f"  {'PASS' if v else 'FAIL'} {k}")
sys.exit(0 if all(checks.values()) else 1)
`;
const wakeResult = spawnSync('python3', ['-c', verifyWake], { encoding: 'utf8' });
console.log(wakeResult.stdout);
if (wakeResult.status !== 0) {
  console.error('STDERR:', wakeResult.stderr);
  process.exit(1);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const allPassed =
  Object.values(checks).every(Boolean) &&
  result.status === 0 &&
  wakeResult.status === 0;

console.log(`\n${allPassed ? '✅' : '❌'} ORCA-122: All ACs ${allPassed ? 'PASS' : 'FAIL'}`);
process.exit(allPassed ? 0 : 1);
