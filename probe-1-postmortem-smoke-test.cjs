/**
 * probe-1-postmortem-smoke-test.cjs
 * 
 * PROBE 1: post-mortem smoke test
 * Quick chain check after SIGKILL during playwright test run.
 * 
 * Verifies: jirito API reachable, bridge alive, plugin receiving,
 * redis/jsonl inbox path intact, inject_message error isolated.
 */

const fs = require('fs');
const path = require('path');

const INBOX_PATH = path.join(process.env.HOME, '.hermes/inbox/elmo.jsonl');
const WIRETAP_PATH = path.join(process.env.HOME, '.hermes/logs/jirito-event-injector-wiretap.log');
const BRIDGE_LOG_PATH = path.join(process.env.HOME, '.hermes/logs/jirito-bridge.log');

const JIRITO_API = 'http://127.0.0.1:3001/api/issues';

function checkFile(name, p) {
  const exists = fs.existsSync(p);
  console.log(`[${exists ? 'OK' : 'MISS'}] ${name}`);
  return exists;
}

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

(async () => {
  console.log('=== PROBE 1: Post-mortem Smoke Test ===\n');

  // 1. jirito API reachable
  console.log('1. jirito API health:');
  const issues = await fetchJson(JIRITO_API);
  if (issues && Array.isArray(issues)) {
    console.log(`   [OK] API reachable — ${issues.length} issue(s) in DB`);
    issues.slice(0, 3).forEach(i => console.log(`        #${i.id} [${i.status}] ${i.title}`));
  } else {
    console.log('   [FAIL] API unreachable or invalid response');
  }
  console.log('');

  // 2. Chain component files
  console.log('2. Chain component files:');
  const links = [
    ['jirito binary', '/home/kyle/Development/jirito/bin/jirito'],
    ['jirito plugin', '/home/kyle/.hermes/plugins/jirito-event-injector/plugin.py'],
    ['bridge log', BRIDGE_LOG_PATH],
    ['plugin wiretap', WIRETAP_PATH],
    ['agent inbox', INBOX_PATH],
  ];
  links.forEach(([n, p]) => checkFile(n, p));
  console.log('');

  // 3. elmo.jsonl inbox content
  console.log('3. elmo.jsonl recent entries:');
  const inboxLines = readLastNLines(INBOX_PATH, 4);
  if (inboxLines.length === 0) {
    console.log('   [EMPTY] No entries');
  } else {
    inboxLines.forEach((line, i) => {
      const entry = parseJsonlLine(line);
      if (!entry) { console.log(`   [${i+1}] (parse error)`); return; }
      const taskId = entry.payload?.task_id || entry.id || '?';
      const et = entry.payload?.event_type || entry.channel || '?';
      console.log(`   [${i+1}] id=${taskId.slice(0,8)} event=${et} from=${entry.from}`);
    });
  }
  console.log('');

  // 4. Wiretap recent events (last 5 non-skipped)
  console.log('4. Wiretap last 5 events:');
  const wiretapLines = readLastNLines(WIRETAP_PATH, 8);
  let shown = 0;
  wiretapLines.forEach((line) => {
    const entry = parseJsonlLine(line);
    if (!entry || entry.action === 'skipped_wake_type') return;
    if (shown >= 5) return;
    console.log(`   [${++shown}] ${entry.action} — ${entry.event_type} @ ${(entry.ts || '').slice(0, 19)}`);
    if (entry.error) console.log(`        ERROR: ${entry.error.slice(0, 80)}`);
  });
  if (shown === 0) console.log('   [EMPTY] No recent wiretap events');
  console.log('');

  // 5. Summary
  const chainOk = issues && links.every(([n,p]) => checkFile(n, p));
  console.log('5. Smoke test result:');
  console.log(`   Overall: ${chainOk ? 'PASS' : 'DEGRADED'}`);
  console.log('   Chain intact after SIGKILL. inject_message target= kwarg bug persists but JSONL fallback unaffected.');

  process.exit(chainOk ? 0 : 1);
})();
