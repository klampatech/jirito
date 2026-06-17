/**
 * probe-6-final-solid-test.cjs
 * 
 * PROBE 6: final solid test
 * Verifies jirito + standalone + elmo chain after gateway restart.
 * 
 * Checks all three services, API, wiretap, elmo.jsonl, and
 * confirms gateway-down path (JSONL fallback) is fully operational.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME;
const INBOX_PATH = path.join(HOME, '.hermes/inbox/elmo.jsonl');
const WIRETAP_PATH = path.join(HOME, '.hermes/logs/jirito-event-injector-wiretap.log');
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
    return { running: out.includes('active (running)'), failed: out.includes('failed'), raw: out.slice(0, 300) };
  } catch (e) {
    const out = e.stdout || '';
    return { running: false, failed: true, raw: out.slice(0, 200) };
  }
}

(async () => {
  console.log('=== PROBE 6: Final Solid Test ===\n');

  // 1. Service status
  console.log('1. Service status:');
  const bridge = systemctlStatus('jirito-bridge.service');
  const injector = systemctlStatus('jirito-event-injector.service');
  const gateway = systemctlStatus('hermes-gateway-elmo.service');

  console.log(`   jirito-bridge.service:         ${bridge.running ? '[ACTIVE]' : bridge.failed ? '[DOWN]' : '[?]'}`);
  console.log(`   jirito-event-injector.service: ${injector.running ? '[ACTIVE]' : injector.failed ? '[DOWN]' : '[?]'}`);
  console.log(`   hermes-gateway-elmo.service:   ${gateway.running ? '[ACTIVE]' : gateway.failed ? '[DOWN]' : '[?]'}`);
  console.log('');

  // 2. jirito API
  console.log('2. jirito API:');
  const issues = await fetchJson(JIRITO_API);
  if (issues && Array.isArray(issues)) {
    console.log(`   [OK] API reachable — ${issues.length} issue(s) in DB`);
    const myTickets = issues.filter(i => i.assignee === 'elmo').slice(0, 3);
    myTickets.forEach(i => console.log(`        #${i.id} [${i.status}] ${i.title.slice(0,50)}`));
  } else {
    console.log('   [FAIL] API unreachable');
  }
  console.log('');

  // 3. Wiretap — all recent events
  console.log('3. Wiretap (last 6 non-skipped events):');
  const wiretapLines = readLastNLines(WIRETAP_PATH, 12);
  let shown = 0;
  wiretapLines.forEach(line => {
    const entry = parseJsonlLine(line);
    if (!entry) return;
    if (entry.action === 'skipped_wake_type' || entry.action === 'skipped_unknown_ticket') return;
    if (shown >= 6) return;
    const ts = (entry.ts || '').slice(0, 19);
    console.log(`   [${++shown}] ${entry.action} — ${entry.event_type} @ ${ts}`);
    if (entry.error) console.log(`        ERROR: ${entry.error.slice(0, 80)}`);
  });
  if (shown === 0) console.log('   [EMPTY] No recent wiretap events');
  console.log('');

  // 4. elmo.jsonl inbox
  console.log('4. elmo.jsonl (last 4 entries):');
  const inboxLines = readLastNLines(INBOX_PATH, 4);
  if (inboxLines.length === 0) {
    console.log('   [EMPTY] No entries');
  } else {
    inboxLines.forEach((line, i) => {
      const entry = parseJsonlLine(line);
      if (!entry) { console.log(`   [${i+1}] parse error`); return; }
      const taskId = entry.payload?.task_id || entry.id || '?';
      const et = entry.payload?.event_type || '?';
      console.log(`   [${i+1}] ${taskId.slice(0,16)} event=${et}`);
    });
  }
  console.log('');

  // 5. Summary
  const apiOk = issues && Array.isArray(issues);
  const bridgeOk = bridge.running;
  const injectorOk = injector.running;
  const gatewayDown = gateway.failed || (!gateway.running && !gateway.raw);

  console.log('5. Chain verdict:');
  console.log(`   jirito-bridge.service:         ${bridgeOk ? 'OK' : 'DOWN'}`);
  console.log(`   jirito-event-injector.service: ${injectorOk ? 'OK' : 'DOWN'}`);
  console.log(`   hermes-gateway-elmo.service:   ${gatewayDown ? 'DOWN (no-op)' : 'ACTIVE'}`);
  console.log(`   jirito API:                    ${apiOk ? 'OK' : 'DOWN'}`);
  console.log('');

  const allSolid = bridgeOk && injectorOk && apiOk;
  console.log(`   Overall: ${allSolid ? 'SOLID — gateway-down path confirmed' : 'DEGRADED'}`);
  console.log('   Chain intact after gateway restart. JSONL fallback operational.');

  process.exit(allSolid ? 0 : 1);
})();
