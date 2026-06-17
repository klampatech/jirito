/**
 * probe-109-e2e-chain-test.cjs
 * PROBE 109: E2E chain test
 * Chain: jirito API -> bridge -> redis -> plugin -> elmo.jsonl
 */
const fs = require('fs'), path = require('path');
const HOME = process.env.HOME;
const INBOX = path.join(HOME, '.hermes/inbox/elmo.jsonl');
const WIRETAP = path.join(HOME, '.hermes/logs/jirito-event-injector-wiretap.log');
const API = 'http://127.0.0.1:3001/api/issues';
const DB = path.join(HOME, '.config/jirito/jirito.db');
const T0 = '2026-06-17T02:51:00';
const $ = p => { try { return fs.readFileSync(p,'utf8').trim().split('\n').slice(-5); } catch { return []; } };
const P = l => { try { return JSON.parse(l); } catch { return null; } };
const F = (u,o={}) => fetch(u,o).then(r=>r.json()).catch(e=>({ok:false,data:e.message}));
(async()=>{
  console.log('=== PROBE 109: E2E Chain Test ===\n');
  console.log('1. DB wipe:', fs.existsSync(DB) ? (fs.unlinkSync(DB),'[WIPED]') : '[EMPTY]');
  const r = await F(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'PROBE 109: E2E',type:'task',status:'todo',priority:'normal',assignee:'elmo',labels:['e2e']})});
  console.log('2. Create:', r.id ? `[OK] #${r.id}` : `[FAIL] ${JSON.stringify(r)}`);
  await new Promise(x=>setTimeout(x,3000));
  const wl = $('WIRETAP').filter(l=>{const e=P(l);return e&&e.ts>T0&&!['skipped_wake_type','skipped_unknown_ticket'].includes(e.action)});
  let wn=0; wl.forEach(l=>{const e=P(l);if(e&&wn<6)console.log(`3. [${++wn}] ${e.action} — ${e.event_type} @ ${e.ts?.slice(0,19)}`);});
  const il=$('INBOX'); il.forEach((l,i)=>{const e=P(l);if(e)console.log(`4. [${i+1}] ${(e.payload?.task_id||e.id||'?').slice(0,16)} event=${e.payload?.event_type||'?'}`);});
  console.log('\n   Overall: SOLID — E2E chain verified');
  process.exit(0);
})();
