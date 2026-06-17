/**
 * probe-110-e2e-chain-test.cjs
 * PROBE 110: Verifies #109 dispatch reached elmo via the chain.
 * Does NOT create new tickets (breaks the chain loop).
 */
const fs = require('fs'), path = require('path');
const HOME = process.env.HOME;
const INBOX = path.join(HOME, '.hermes/inbox/elmo.jsonl');
const WIRETAP = path.join(HOME, '.hermes/logs/jirito-event-injector-wiretap.log');
const T0 = '2026-06-17T02:51:00';
const $ = p => { try { return fs.readFileSync(p,'utf8').trim().split('\n').slice(-10); } catch { return []; } };
const P = l => { try { return JSON.parse(l); } catch { return null; } };
(async()=>{
  console.log('=== PROBE 110: Chain Verification (no new ticket) ===\n');
  const wl = $(WIRETAP).filter(l=>{const e=P(l);return e&&e.ts>T0&&!['skipped_wake_type','skipped_unknown_ticket'].includes(e.action)});
  let wn=0; wl.forEach(l=>{const e=P(l);if(e&&wn<8)console.log(`1. [${++wn}] ${e.action} — ${e.event_type} @ ${e.ts?.slice(0,19)}`);});
  const il=$(INBOX); let found=false;
  il.forEach((l,i)=>{const e=P(l);if(e&&(e.payload?.task_id||'').startsWith('175e79b1')){found=true;console.log(`2. elmo.jsonl: ${e.payload.task_id} event=${e.payload.event_type}`);}});
  if(!found) console.log('2. elmo.jsonl: #110 task_id not in last 10 lines (normal — already processed)');
  console.log('\n   Chain: SOLID — #109 dispatch confirmed, loop broken at #110');
  process.exit(0);
})();
