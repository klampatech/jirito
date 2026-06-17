/**
 * probe-2-solid-chain-test.cjs
 * 
 * PROBE 2: solid chain test
 * Verifies: jirito.service + jirito-event-injector.service + gateway no-op.
 * 
 * Checks all three services, the API, the wiretap, and the inbox.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME;
const INBOX_PATH = path.join(HOME, '.hermes/inbox/elmo.jsonl');
const WIRETAP_PATH = path.join(HOME, '.hermes/logs/jirito-event-injector-wiretap.log');
const BRIDGE_LOG_PATH = path.join(HOME, '.hermes/logs/jirito-bridge.log');
const JIRITO_API = 'http://127.0.0.1:3001/api/issues';

function readLastNLines(p, n) {
  try {
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.trim().split('\n');
    return lines.slice(-n);
  } catch { return []; }
}

function parseJsonlLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function systemctlStatus(service) {
  try {
    const out = execSync(`systemctl --user status ${service} 2>&1`, { timeout: 5000, encoding: 'utf8' });
    const active = out.includes('active (running)');
    const inactive = out.includes('inactive') || out.includes('failed');
    return { running: active, failed: inactive && !active, raw: out.slice(0, 200) };
  } catch (e) {
    const out = e.stdout || e.message || '';
    return { running: false, failed: true, raw: out.slice(0, 200) };
  }
}

(async () => {
  console.log('=== PROBE 2: Solid Chain Test ===\n');

  // 1. Service status
  console.log('1. Service status:');
  const bridge = systemctlStatus('jirito-bridge.service');
  const injector = systemctlStatus('jirito-event-injector.service');
  const gateway = systemctlStatus('hermes-gateway-elmo.service');

  console.log(`   jirito-bridge.service:         ${bridge.running ? '[ACTIVE]' : bridge.failed ? '[FAILED]' : '[?]'} ${bridge.running ? 'running' : bridge.failed ? 'failed/not running' : 'unknown'}`);
  console.log(`   jirito-event-injector.service: ${injector.running ? '[ACTIVE]' : injector.failed ? '[FAILED]' : '[?]'} ${injector.running ? 'running' : injector.failed ? 'failed/not running' : 'unknown'}`);
  console.log(`   hermes-gateway-elmo.service:   ${gateway.running ? '[ACTIVE]' : gateway.failed ? '[DOWN]' : '[?]'} ${gateway.running ? 'running' : gateway.failed ? 'down (no-op for chain)' : 'unknown'}`);
  console.log('');

  // 2. jirito API
  console.log('2. jirito API:');
  const issues = await fetchJson(JIRITO_API);
  if (issues && Array.isArray(issues)) {
    console.log(`   [OK] API reachable — ${issues.length} issue(s)`);
    issues.slice(0, 3).forEach(i => console.log(`        #${i.id} [${i.status}] ${i.title}`));
  } else {
    console.log('   [FAIL] API unreachable');
  }
  console.log('');

  // 3. Wiretap
  console.log('3. Wiretap (last 5 events):');
  const wiretapLines = readLastNLines(WIRETAP_PATH, 8);
  let shown = 0;
  wiretapLines.forEach(line => {
    const entry = parseJsonlLine(line);
    if (!entry || entry.action === 'skipped_wake_type') return;
    if (shown >= 5) return;
    console.log(`   [${++shown}] ${entry.action} — ${entry.event_type} @ ${(entry.ts || '').slice(0, 19)}`);
    if (entry.error) console.log(`        ERROR: ${entry.error.slice(0, 80)}`);
  });
  if (shown === 0) console.log('   [EMPTY] No recent wiretap events');
  console.log('');

  // 4. elmo.jsonl
  console.log('4. elmo.jsonl (last 3 entries):');
  const inboxLines = readLastNLines(INBOX_PATH, 3);
  if (inboxLines.length === 0) {
    console.log('   [EMPTY] No entries');
  } else {
    inboxLines.forEach((line, i) => {
      const entry = parseJsonlLine(line);
      if (!entry) { console.log(`   [${i+1}] (parse error)`); return; }
      const taskId = entry.payload?.task_id || entry.id || '?';
      const et = entry.payload?.event_type || entry.channel || '?';
      console.log(`   [${i+1}] ${taskId.slice(0,12)} event=${et}`);
    });
  }
  console.log('');

  // 5. Summary
  const apiOk = issues && Array.isArray(issues);
  const bridgeOk = bridge.running;
  const injectorOk = injector.running;
  const gatewayNote = gateway.running ? 'gateway active' : 'gateway down (no-op for this chain)';

  console.log('5. Chain status:');
  console.log(`   jirito-bridge.service:         ${bridgeOk ? 'OK' : 'DOWN'}`);
  console.log(`   jirito-event-injector.service: ${injectorOk ? 'OK' : 'DOWN'}`);
  console.log(`   hermes-gateway-elmo.service:   ${gatewayNote}`);
  console.log(`   jirito API:                    ${apiOk ? 'OK' : 'DOWN'}`);
  console.log('');

  const allSolid = bridgeOk && injectorOk && apiOk;
  console.log(`   Overall: ${allSolid ? 'SOLID' : 'DEGRADED'}`);

  process.exit(allSolid ? 0 : 1);
})();
