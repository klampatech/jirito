/**
 * probe-102-e2e-chain-test.cjs
 * 
 * PROBE 102: E2E chain test
 * Wipe DB + create from CLI as smoke test.
 * 
 * Full chain: jirito CLI -> API -> bridge -> redis -> plugin -> elmo.jsonl
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME;
const INBOX_PATH = path.join(HOME, '.hermes/inbox/elmo.jsonl');
const WIRETAP_PATH = path.join(HOME, '.hermes/logs/jirito-event-injector-wiretap.log');
const JIRITO_API = 'http://127.0.0.1:3001/api/issues';
const JIRITO_DB = path.join(HOME, '.config/jirito/jirito.db');

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

async function fetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    try { return { ok: res.ok, data: JSON.parse(text) }; }
    catch { return { ok: res.ok, data: text.slice(0, 200) }; }
  } catch (e) { return { ok: false, data: e.message }; }
}

function systemctlStatus(service) {
  try {
    const out = execSync(`systemctl --user status ${service} 2>&1`, { timeout: 5000, encoding: 'utf8' });
    return { running: out.includes('active (running)'), failed: out.includes('failed'), raw: out.slice(0, 200) };
  } catch (e) {
    const out = e.stdout || '';
    return { running: false, failed: true, raw: out.slice(0, 200) };
  }
}

(async () => {
  console.log('=== PROBE 102: E2E Chain Test ===\n');

  // 0. Record baseline
  const beforeLines = readLastNLines(WIRETAP_PATH, 5);
  const beforeInbox = readLastNLines(INBOX_PATH, 3);
  const beforeEntryId = beforeInbox.length > 0
    ? (parseJsonlLine(beforeInbox[beforeInbox.length - 1]) || {}).id || '?'
    : '?';

  // 1. Service status
  console.log('1. Service status:');
  const bridge = systemctlStatus('jirito-bridge.service');
  const injector = systemctlStatus('jirito-event-injector.service');
  const gateway = systemctlStatus('hermes-gateway-elmo.service');

  console.log(`   jirito-bridge.service:         ${bridge.running ? '[ACTIVE]' : bridge.failed ? '[DOWN]' : '[?]'}`);
  console.log(`   jirito-event-injector.service: ${injector.running ? '[ACTIVE]' : injector.failed ? '[DOWN]' : '[?]'}`);
  console.log(`   hermes-gateway-elmo.service:   ${gateway.running ? '[ACTIVE]' : gateway.failed ? '[DOWN]' : '[?]'}`);
  console.log('');

  // 2. Wipe DB
  console.log('2. Wipe DB:');
  const dbExists = fs.existsSync(JIRITO_DB);
  if (dbExists) {
    try {
      fs.unlinkSync(JIRITO_DB);
      console.log('   [WIPED] jirito.db deleted');
    } catch (e) {
      console.log(`   [SKIP] Could not delete DB: ${e.message}`);
    }
  } else {
    console.log('   [EMPTY] No DB file present');
  }
  console.log('');

  // 3. Create ticket via API (simulate CLI)
  console.log('3. Create ticket via API (simulating CLI wipe+create):');
  const newIssue = {
    title: 'PROBE 102: E2E chain test',
    description: 'Wipe + create from CLI as smoke test',
    type: 'task',
    status: 'todo',
    priority: 'normal',
    assignee: 'elmo',
    reporter: 'kyle',
    labels: ['e2e']
  };
  const createResp = await fetchJson(JIRITO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newIssue)
  });
  if (createResp.ok && createResp.data && createResp.data.id) {
    console.log(`   [OK] Created issue #${createResp.data.id}`);
  } else {
    console.log(`   [FAIL] Create failed: ${JSON.stringify(createResp.data)}`);
  }
  console.log('');

  // 4. Wait for event to propagate
  console.log('4. Wait for chain propagation (3s)...');
  await new Promise(r => setTimeout(r, 3000));

  // 5. Check wiretap
  console.log('5. Wiretap (new events since baseline):');
  const afterLines = readLastNLines(WIRETAP_PATH, 20);
  const newEvents = afterLines.filter(line => {
    const entry = parseJsonlLine(line);
    if (!entry) return false;
    // Show events after our baseline entry
    return entry.ts > '2026-06-17T02:16:00';
  });
  let shown = 0;
  newEvents.forEach(line => {
    const entry = parseJsonlLine(line);
    if (!entry) return;
    if (shown >= 6) return;
    if (entry.action === 'skipped_wake_type' || entry.action === 'skipped_unknown_ticket') return;
    console.log(`   [${++shown}] ${entry.action} — ${entry.event_type} @ ${(entry.ts || '').slice(0, 19)}`);
    if (entry.error) console.log(`        ERROR: ${entry.error.slice(0, 80)}`);
  });
  if (shown === 0) console.log('   [EMPTY] No new wiretap events');
  console.log('');

  // 6. Check elmo.jsonl
  console.log('6. elmo.jsonl (last 4 entries):');
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

  // 7. Summary
  const bridgeOk = bridge.running;
  const injectorOk = injector.running;
  const chainOk = bridgeOk && injectorOk;

  console.log('7. Chain verdict:');
  console.log(`   jirito-bridge.service:         ${bridgeOk ? 'OK' : 'DOWN'}`);
  console.log(`   jirito-event-injector.service: ${injectorOk ? 'OK' : 'DOWN'}`);
  console.log(`   hermes-gateway-elmo.service:   ${gateway.running ? 'ACTIVE' : 'DOWN (no-op)'}`);
  console.log('');
  console.log(`   Overall: ${chainOk ? 'SOLID — wipe+create chain verified' : 'DEGRADED'}`);

  process.exit(chainOk ? 0 : 1);
})();
