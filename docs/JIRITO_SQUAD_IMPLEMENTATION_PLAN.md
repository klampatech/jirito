# Jirito × Squad Integration — Implementation Plan

> Companion to `JIRITO_SQUAD_SPEC.md`. Read the spec first; this document is the buildable plan.

## Context

Jirito (a personal Kanban) already has a complete REST API and SQLite persistence. Today, the squad coordination is Discord + pub/sub, with work-in-flight invisible unless you ask. This plan makes jirito the source of truth: squad agents read tickets via a CLI, work them, surface them for review, and Evo + Kyle sign off — all visible in the jirito UI and #operations.

The build is 9 phases over ~1 working day. Each phase is independently verifiable and reverts cleanly if needed. The plan is dispatch-shaped: most phases go to squad agents (Elmo for code, Bert for design decisions) with me orchestrating and verifying.

**Working branch**: `feat/squad-integration` (created 2026-06-16). All jirito-code changes for this project go to that branch. Plugin code and skills live in `~/.hermes/` and are not branch-tracked.

## Status (2026-06-16)

| Phase | Component | Status | Verified |
|---|---|---|---|
| 1 | Schema, Outbox, Columns Route | ✅ done | 2026-06-15 |
| 2 | Webhook Emitter | ✅ done | 2026-06-15 |
| 3 | Webhook Bridge | ✅ done | 2026-06-15 |
| 4 | Outbox Drainer | ✅ done | 2026-06-15 |
| 5 | `jirito` CLI | ✅ done | 2026-06-15 |
| 6 | Evo Wake Injector Plugin | ✅ done | 2026-06-15 |
| 6.1 | Plugin hardening (format extract + ticket-exists guard) | ✅ done | 2026-06-16 |
| 7 | Squad Agent Protocol Skill | ⏳ next | — |
| 8 | Review Flow Skill | ⏳ pending | — |
| 9 | E2E Test | ⏳ pending | — |

## Topology

See spec §Topology for the full diagram. Short version:

- `jirito:3001` — existing server, gains a `webhooks.ts` module that POSTs to the bridge
- `bridge:3030` — new Node service, receives webhooks, publishes to Redis
- `~/.hermes/plugins/jirito-event-injector/` — new Hermes plugin, subscribes to `jirito/events`, wakes Evo
- `bin/jirito` — new Python CLI in $PATH
- `~/.hermes/skills/jirito-squad-protocol/` — new agent-side skill
- `~/.hermes/skills/jirito-review/` — new Evo-side skill
- `scripts/drain-outbox.js` — no_agent cron job, retries failed webhooks
- Redis channel `jirito/events` — new pub/sub channel (parallel to `squad/events`)

## Implementation Phases

### Phase 1 — Schema, Outbox & Columns Route (~45 min)

**Goal**: `prUrl` column on `issues`; `webhook_outbox` table for durable webhook delivery; new `/api/columns` CRUD route so the `jirito block` CLI can look up the Blocked custom column by name.

**Steps**

1. Add migration in `server/db/init.ts` → `migrateTables()`:
   ```typescript
   const outboxInfo = db.exec("PRAGMA table_info(webhook_outbox)");
   if (outboxInfo.length === 0) {
     db.run(`
       CREATE TABLE webhook_outbox (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         event_id TEXT UNIQUE NOT NULL,
         event_type TEXT NOT NULL,
         payload TEXT NOT NULL,
         status TEXT DEFAULT 'pending',
         attempts INTEGER DEFAULT 0,
         last_attempt_at TEXT,
         delivered_at TEXT,
         last_error TEXT,
         created_at TEXT DEFAULT (datetime('now'))
       )
     `);
     db.run(`
       CREATE INDEX idx_outbox_status_created
         ON webhook_outbox(status, created_at)
     `);
     console.log("Created webhook_outbox table");
   }
   ```
2. Add `prUrl` to `issues` in `initTables()` and `migrateTables()`:
   ```typescript
   // initTables: add `prUrl TEXT DEFAULT ''` to CREATE TABLE
   // migrateTables: tryAddColumn(db, "issues", "prUrl", "TEXT", "''")
   ```
3. Add `prUrl` to `UPDATABLE_FIELDS` in `server/routes/issues.ts`.
4. **New file** `server/routes/columns.ts` (~100 lines, mirror of `issues.ts`):
   - `GET /api/columns` (optional `?name=…` filter)
   - `GET /api/columns/:id`
   - `POST /api/columns`
   - `PUT /api/columns/:id`
   - `DELETE /api/columns/:id`
5. Wire the columns routes into `server/index.ts` `dispatch()` function (5 if-blocks, mirror of the projects/sprints wiring).
6. Build: `npm run build`. Restart `npm run dev`.

**Pre-work (Kyle, before implementation starts)**

- [ ] In the jirito UI, create a custom column named exactly `Blocked` (with capital B, no other whitespace). Note its id (visible in the URL or via the new `GET /api/columns` after Phase 1 lands).
- [ ] The CLI will look up the column by name; the cached id goes in `~/.config/jirito/blocked-column-id`.

**Verification**

- [ ] `sqlite3 ~/Development/jirito/jirito.db ".schema issues"` shows `prUrl` column
- [ ] `sqlite3 ~/Development/jirito/jirito.db ".schema webhook_outbox"` shows the new table
- [ ] `curl -X PUT http://localhost:3001/api/issues/1 -H "Content-Type: application/json" -d '{"prUrl":"https://github.com/foo/bar/pull/1"}'` returns 200
- [ ] `curl http://localhost:3001/api/issues/1` shows `prUrl` in the response
- [ ] `curl http://localhost:3001/api/columns` returns `[]` (or the existing custom columns)
- [ ] `curl -X POST http://localhost:3001/api/columns -H "Content-Type: application/json" -d '{"name":"Test Column"}'` returns 201 with the new column
- [ ] `curl -X DELETE http://localhost:3001/api/columns/<new-id>` returns 200

---

### Phase 2 — Webhook Emitter (~1 hour)

**Goal**: `server/webhooks.ts` exports `emitEvent(event_type, payload)`. Every write path (issues, comments) calls it after `saveDb()`.

**Steps**

1. New file `server/webhooks.ts`:
   ```typescript
   import { randomUUID } from "node:crypto";
   import { getDb, saveDb } from "./db/index.js";

   const BRIDGE_URL = process.env.JIRITO_WEBHOOK_BRIDGE_URL
     || "http://localhost:3030";
   const ENABLED = process.env.JIRITO_WEBHOOK_ENABLED !== "false";

   /**
    * Emit a webhook event. Inserts a row into webhook_outbox and fires
    * a fire-and-forget POST to the bridge. Does not block the caller.
    */
   export async function emitEvent(
     event_type: string,
     payload: Record<string, unknown>
   ): Promise<void> {
     if (!ENABLED) {
       console.log(`[webhook] disabled, skipping ${event_type}`);
       return;
     }
     const db = getDb();
     if (!db) return;
     const event_id = randomUUID();
     const envelope = {
       event_id,
       event_type,
       timestamp: new Date().toISOString(),
       source: "jirito",
       payload,
     };
     try {
       db.run(
         `INSERT INTO webhook_outbox (event_id, event_type, payload, status)
          VALUES (?, ?, ?, 'pending')`,
         [event_id, event_type, JSON.stringify(envelope)]
       );
       await saveDb();
       // Fire-and-forget POST — do not await
       void postToBridge(event_id, envelope);
     } catch (err) {
       console.error(`[webhook] outbox insert failed for ${event_type}:`, err);
     }
   }

   async function postToBridge(event_id: string, envelope: object): Promise<void> {
     try {
       const res = await fetch(`${BRIDGE_URL}/webhook`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(envelope),
         signal: AbortSignal.timeout(2000),
       });
       if (res.ok) {
         const db = getDb();
         if (db) {
           db.run(
             `UPDATE webhook_outbox
              SET status='delivered', delivered_at=datetime('now')
              WHERE event_id = ?`,
             [event_id]
           );
           await saveDb();
         }
       } else {
         console.warn(`[webhook] bridge returned ${res.status} for ${event_id}`);
       }
     } catch (err) {
       console.warn(`[webhook] POST failed for ${event_id}:`, (err as Error).message);
     }
   }
   ```
2. In `server/routes/issues.ts`:
   - After `create()` saves, call `emitEvent("ticket.created", {...input, id: Number(id), createdAt: now, updatedAt: now})`
   - In `update()`: compute `from` status by reading the row before update; emit `ticket.moved` with `{id, from, to: input.status, actor: input.assignee || "system"}`. Also emit `ticket.review` when `to === "review"`.
   - In `remove()`: emit `ticket.deleted` (or just `ticket.moved` with `to="trash"`)
3. In `server/routes/comments.ts`: after `create()`, emit `ticket.commented` with `{issueId, commentId, author, preview: content.slice(0, 100)}`.
4. Build, restart.

**Verification**

- [ ] With bridge down, `curl -X POST http://localhost:3001/api/issues -d '{...}'` returns 201 within 100ms (no blocking)
- [ ] `sqlite3 jirito.db "SELECT * FROM webhook_outbox"` shows a `pending` row
- [ ] With bridge up, `curl` returns 201 AND the outbox row's `status` becomes `delivered` within 2s
- [ ] No regression: existing 236 Playwright tests still pass (`npm test`)

---

### Phase 3 — Webhook Bridge Service (~1 hour)

**Goal**: Standalone Node service on `:3030` that publishes incoming webhooks to Redis, supervised by a user systemd unit.

**Steps**

1. Create `bridge/` directory at jirito repo root.
2. Create `bridge/package.json`:
   ```json
   {
     "name": "jirito-webhook-bridge",
     "version": "0.1.0",
     "type": "module",
     "private": true,
     "main": "server.js",
     "scripts": { "start": "node server.js" },
     "dependencies": { "redis": "^4.7.0" }
   }
   ```
3. Create `bridge/server.js` (~120 lines, key shape):
   ```javascript
   // Imports: node:http, node:url, redis, an LRU cache lib
   // GET /health, POST /webhook
   // Publishes to 'jirito/events' channel
   // Binds to 127.0.0.1:3030
   ```
4. `cd bridge && npm install`.
5. Create `~/.config/systemd/user/jirito-bridge.service`:
   ```ini
   [Unit]
   Description=Jirito webhook bridge (publishes to Redis on jirito/events)
   After=network.target
   # Redis is in Docker, no native unit — just rely on network.target.

   [Service]
   Type=simple
   WorkingDirectory=/home/kyle/Development/jirito/bridge
   ExecStart=/usr/bin/env node /home/kyle/Development/jirito/bridge/server.js
   Restart=on-failure
   RestartSec=5s
   StandardOutput=append:/home/kyle/.hermes/logs/jirito-bridge.log
   StandardError=append:/home/kyle/.hermes/logs/jirito-bridge.log

   [Install]
   WantedBy=default.target
   ```
6. Enable + start:
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable jirito-bridge.service
   systemctl --user start  jirito-bridge.service
   systemctl --user status jirito-bridge.service
   ```
7. Verify it stays up: `systemctl --user is-active jirito-bridge`. Survives logout? Yes, with `loginctl enable-linger kyle` (one-time setup, matches existing squad services).

**Verification**

- [ ] `curl http://localhost:3030/health` returns `{"status":"ok","redis":"connected"}`
- [ ] `redis-cli SUBSCRIBE jirito_events &` (in another terminal), then `curl -X POST http://localhost:3030/webhook -H "Content-Type: application/json" -d '{"event_id":"test-1","event_type":"ticket.created","timestamp":"...","source":"jirito","payload":{"id":999}}'` — the subscriber shows the message
- [ ] `systemctl --user stop jirito-bridge` — subsequent POST returns connection refused. `systemctl --user start jirito-bridge` — POST returns 200.
- [ ] `journalctl --user -u jirito-bridge -n 50` (or `tail -f ~/.hermes/logs/jirito-bridge.log`) shows structured JSON lines
- [ ] Reboot m5 → bridge auto-starts on user login (verify with `systemctl --user status jirito-bridge` after reboot)

---

### Phase 4 — Outbox Drainer (~30 min)

**Goal**: `no_agent` cron job that retries failed webhook deliveries.

**Steps**

1. Create `scripts/drain-outbox.js`:
   ```javascript
   // Queries webhook_outbox for pending rows with backoff logic
   // POSTs to bridge
   // Updates status on result
   // Exits 0 on success or no work, 1 on errors
   ```
2. Create a cron job:
   ```bash
   hermes cronjob create \
     --name "jirito-outbox-drainer" \
     --schedule "every 1m" \
     --script "/home/kyle/Development/jirito/scripts/drain-outbox.js" \
     --no-agent \
     --deliver local
   ```
3. Verify the cron is registered and runs.

**Verification**

- [ ] Stop the bridge. Create 3 tickets via API. Outbox accumulates 3 `pending` rows.
- [ ] Restart the bridge. Within 60-90s, the drainer cron delivers all 3; outbox shows `delivered`.
- [ ] `~/.hermes/cron/output/jirito-outbox-drainer/latest.log` shows `drained 3 delivered, 0 still pending, 0 dead` on success, or alerts on persistent errors.
- [ ] Manually insert a row with `attempts=10, status='pending'` — drainer skips it (marking it `dead` first if not already).

---

### Phase 5 — Jirito CLI (~30 min)

**Goal**: `bin/jirito` Python script, symlinked into `$PATH`.

**Steps**

1. Create `bin/jirito` (the full script lives in the spec, Topic 5; the implementation matches).
2. `chmod +x bin/jirito`
3. `ln -sf ~/Development/jirito/bin/jirito ~/.local/bin/jirito`
4. `hash -r` (or restart shell) so `$PATH` picks up the new symlink.

**Verification**

- [ ] `which jirito` returns `~/.local/bin/jirito`
- [ ] `jirito list` returns the 6 sample tickets from the jirito.db
- [ ] `jirito show 107` returns the test ticket from Phase 2's verification
- [ ] `jirito move 107 inprogress --assignee elmo` — `jirito show 107` now shows status=inprogress
- [ ] `jirito comment 107 --text="cli test" --author=elmo` — `jirito show 107` shows the comment (via `/api/comments?issueId=107`)
- [ ] `jirito mine elmo` shows all tickets with `assignee=elmo`

---

### Phase 6 — Evo Wake Injector Plugin (~1 hour)

**Goal**: New Hermes plugin `jirito-event-injector` that subscribes to `jirito/events` and wakes Evo on `ticket.review` and unassigned `ticket.created`.

**Steps**

1. Create `~/.hermes/plugins/jirito-event-injector/`:
   - `__init__.py` (empty)
   - `plugin.py` (~150 lines, modeled on `squad-relay/plugin.py`)
   - `plugin.yaml` (manifest, modeled on `squad-relay/plugin.yaml`)
2. Key logic in `plugin.py`:
   ```python
   # Subscribe to jirito/events
   # On ticket.review: inject_synthetic_event("[JIRITO REVIEW] #N: title\npr_url: ...")
   # On ticket.created with empty assignee: inject_synthetic_event("[JIRITO TRIAGE] #N: ...")
   # Dedup by event_id (LRU cache)
   # Cooldown 2s per channel
   # Wiretap log to ~/.hermes/logs/jirito-event-injector-wiretap.log
   ```
3. Restart Hermes (or run `hermes plugins reload` if the command exists; otherwise full restart).
4. Verify plugin loaded: `hermes plugins list | grep jirito` (or check the boot logs).

**Verification**

- [ ] `tail -f ~/.hermes/logs/jirito-event-injector-wiretap.log` shows events arriving as they're published
- [ ] Manual test: `redis-cli PUBLISH jirito_events '{"event_id":"t1","event_type":"ticket.review","timestamp":"...","source":"jirito","payload":{"id":107,"title":"Test","prUrl":"https://...","actor":"elmo","projectId":"default","labels":[]}}'`. Within 5s, Evo's next turn (or a `/new` turn) starts with `[JIRITO REVIEW] #107: Test` injected.
- [ ] Publish the same `event_id` twice. Second publish does NOT inject (dedup works).
- [ ] Kill Redis. Publish a test event (jirito is down too, so this is the unit-test case). Plugin logs reconnect attempts. Restart Redis. Plugin resumes.

---

### Phase 7 — Squad Agent Protocol Skill (~30 min)

**Goal**: `~/.hermes/skills/jirito-squad-protocol/SKILL.md` auto-loads on `JIRITO-N:` tasks.

**Steps**

1. Create `~/.hermes/skills/jirito-squad-protocol/SKILL.md` per spec Topic 7.
2. Frontmatter:
   ```yaml
   ---
   name: jirito-squad-protocol
   description: Squad agent contract for working Jirito tickets. Auto-load when a dispatched task starts with "JIRITO-".
   triggers:
     - "JIRITO-"
   ---
   ```
3. Body: protocol steps 1-9, pitfalls section, example commands.
4. The skill is profile-agnostic — all 4 agents can load it. No per-profile config needed.
5. Restart the 4 squad agents (`squad-clis.sh restart`) so they pick up the new skill.

**Verification**

- [ ] Dispatch a test task to Elmo: `squad-dispatch-redis.py elmo "JIRITO-107: test protocol" --output-dir /tmp/jirito-test`
- [ ] Elmo's first turn loads the skill (check Elmo's log: `grep "jirito-squad-protocol" ~/.hermes/profiles/elmo/logs/agent.log`)
- [ ] Elmo follows the protocol: `jirito show 107`, `jirito move 107 inprogress --assignee elmo`, etc.

---

### Phase 8 — Review Flow Skill (~30 min)

**Goal**: `~/.hermes/skills/jirito-review/SKILL.md` auto-loads on `[JIRITO REVIEW]` wakes.

**Steps**

1. Create `~/.hermes/skills/jirito-review/SKILL.md` per spec Topic 8.
2. Frontmatter:
   ```yaml
   ---
   name: jirito-review
   description: Evo's review protocol for Jirito tickets in 'review' status. Auto-load when a synthetic event starts with "[JIRITO REVIEW]".
   triggers:
     - "[JIRITO REVIEW]"
     - "[JIRITO TRIAGE]"
   ---
   ```
3. Body: review protocol (read ticket, fetch PR, decide, act), escalation rules, 3-strikes-and-out.
4. This is Evo's skill (default profile), not the squad's. The squad doesn't need it.

**Verification**

- [ ] Trigger a review: publish a `ticket.review` event manually (or wait for one from Phase 7's test).
- [ ] Evo's next turn loads the `jirito-review` skill (check default profile's `agent.log`).
- [ ] Evo follows the protocol: reads ticket, fetches PR, posts verdict to #operations, moves ticket appropriately.

---

### Phase 9 — End-to-End Test (~1 hour)

**Goal**: Full pipeline runs. Kyle files a ticket → squad works it → Evo reviews → Kyle signs off.

**Steps**

1. Start fresh: `pkill -f "tsx server/index.ts"; pkill -f "node bridge/server.js"; sleep 1`
2. Start jirito: `nohup npx tsx server/index.ts > /tmp/jirito.log 2>&1 &`
3. Start bridge: `nohup node bridge/server.js > ~/.hermes/logs/jirito-bridge.log 2>&1 &`
4. Verify drainer cron is still scheduled.
5. Test scenario:
   a. Kyle creates a ticket via the jirito UI (or `jirito create --title="E2E test ticket" --type=task --priority=high`).
   b. `ticket.created` fires, plugin wakes Evo.
   c. Evo triages → assigns → dispatches to Elmo.
   d. Elmo works the ticket (a trivial change to jirito, e.g. add a `priority: 'low'` to a sample ticket via the API).
   e. Elmo moves to `review` with `prUrl` (pointing at no real PR, but a stub — for the test).
   f. `ticket.review` fires, plugin wakes Evo.
   g. Evo reviews, posts to #operations, leaves at `review`.
   h. Kyle manually moves to `done` in jirito UI.
6. Document the test in a new `docs/E2E_TEST.md` for regression.
7. Take a screenshot of the jirito board with the test ticket visible. Add to README's screenshot section.

**Verification**

- [ ] End-to-end test passes: ticket moves from `backlog` → `inprogress` → `review` → `done` with appropriate events firing at each transition.
- [ ] #operations shows the sign-off line: `🟢 JIRITO-N ready for sign-off — ...`
- [ ] jirito UI shows the ticket in the `Done` column.
- [ ] Outbox is empty (all events delivered).
- [ ] No errors in any logs.

---

## Model/Service Configuration

| Component | Tech | Port / Location | Notes |
|---|---|---|---|
| jirito server | Node 22 + sql.js | `:3001` (existing) | Gains `webhooks.ts` |
| Webhook bridge | Node 22 + redis@4 | `:3030` (new) | Standalone process |
| Outbox drainer | Node script | cron @ 1m | `no_agent` cron job |
| Jirito CLI | Python 3.10+ stdlib | `~/.local/bin/jirito` | Symlink to repo |
| Evo wake injector | Python + redis | Hermes plugin | Mirrors squad-relay pattern |
| Redis | existing | `localhost:6379` | New channel: `jirito/events` |

No new model deployments. No new infrastructure. Same m5 box.

## Verification Checklist

- [ ] All 9 phases pass their individual verification lists
- [ ] Existing 236 Playwright E2E tests still pass
- [ ] 66 Vitest unit tests still pass
- [ ] `npm run typecheck` passes
- [ ] No new lint errors
- [ ] End-to-end test in Phase 9 passes
- [ ] Discord #operations shows expected messages during E2E

## File Locations

| Component | Path | New? |
|---|---|---|
| Spec | `~/Development/jirito/docs/JIRITO_SQUAD_SPEC.md` | new |
| Implementation plan | `~/Development/jirito/docs/JIRITO_SQUAD_IMPLEMENTATION_PLAN.md` | new |
| E2E test doc | `~/Development/jirito/docs/E2E_TEST.md` | new (Phase 9) |
| Webhook emitter | `~/Development/jirito/server/webhooks.ts` | new |
| DB init (outbox + prUrl) | `~/Development/jirito/server/db/init.ts` | modified |
| Issues route (prUrl + emits) | `~/Development/jirito/server/routes/issues.ts` | modified |
| Comments route (emits) | `~/Development/jirito/server/routes/comments.ts` | modified |
| Webhook bridge | `~/Development/jirito/bridge/` | new directory |
| Outbox drainer | `~/Development/jirito/scripts/drain-outbox.js` | new |
| Jirito CLI | `~/Development/jirito/bin/jirito` | new |
| Evo wake injector plugin | `~/.hermes/plugins/jirito-event-injector/` | new |
| Squad protocol skill | `~/.hermes/skills/jirito-squad-protocol/SKILL.md` | new |
| Review flow skill | `~/.hermes/skills/jirito-review/SKILL.md` | new |
| Drainer cron | (cron job, no file) | new |
| Wiretap log | `~/.hermes/logs/jirito-event-injector-wiretap.log` | new (auto) |
| Bridge log | `~/.hermes/logs/jirito-bridge.log` | new (auto) |
| Outbox dead-letter log | `~/.hermes/logs/jirito-outbox-dead.log` | new (auto) |

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| sql.js in-memory DB loses data on crash | medium | Outbox is in the same DB — if the DB is lost, events are lost. Mitigation: regular file backups of `jirito.db` (out of scope here but flag for v2). |
| Bridge port collision with another service | low | Default 3030; configurable via `BRIDGE_PORT` env var. |
| Plugin loaded twice (duplicate wake) | low | Dedup by `event_id` (LRU cache). |
| Agent fabricates a PR URL to move to `review` | medium | Pitfall in protocol skill: "no PR target? comment + move to `blocked`, do not invent." |
| Evo's triage LLM misroutes | low | Agent name in the dispatch brief + Kyle can re-assign in the UI. |
| m5 reboot during a write | low | Outbox persists on disk. Drainer resumes on next tick after reboot. |
| Backpressure if many tickets at once | low | Drainer processes 50/cycle. Cooldown on the plugin prevents wake flood. |

## Out of Scope (whole project)

- Multi-tenant / auth / TLS
- Web UI changes to jirito
- Bidirectional comment wakes (Kyle's comments don't wake agents)
- PR auto-merge
- Backup of `jirito.db` (flagged; separate effort)
- Dead-letter UI in jirito
- Webhook signing
- `blocked` status (use `inprogress` + `labels: ['blocked']` for v1)
- Replay API
- Multi-bridge fanout
- Auto-promote to `done` on pass (stays at `review` for Kyle's manual sign-off)

## Open Questions (read before dispatching)

1. **`blocked` representation** — **RESOLVED 2026-06-15**: use a custom column named `Blocked` in the jirito UI. Kyle creates the column manually (no schema migration). Agents move tickets into the column via the `jirito block` CLI subcommand. No jirito schema change required. **Pre-work for Kyle**: create the column in the UI before Phase 5 (CLI).
2. **Auto-promote to `done` on review-pass** — Currently stays at `review`. Could auto-promote + notify Kyle. The plan sticks with "stay at review" per Kyle's "I'll manually sign off."
3. **Bridge supervisor** — **RESOLVED 2026-06-15**: user systemd unit at `~/.config/systemd/user/jirito-bridge.service`. Matches the pattern of all other Kyle services (`squad-relay`, `squad-agent-inbox-*`, `hermes-gateway-*`, etc.). Requires `loginctl enable-linger kyle` for boot-time start without an active session.
4. **Plugin order** — the new plugin should load AFTER squad-relay (in case of event-type name collisions). Plugin loader order is alphabetical-ish; verify after restart.
5. **Outbox table column types** — TEXT for `event_id`, `event_type`, `payload`, etc. INTEGER for `attempts`. SQLite is dynamically typed but explicit is better. Confirm or override.

## Assumptions (read before dispatching)

- All services run on `127.0.0.1` of m5. Bridge and jirito on host network; Redis in Docker (`redis-squad` container) publishes port 6379 to host.
- Redis is in a Docker container (`redis-squad`, image `redis:latest`, 2 weeks uptime, RDB persistence, AOF off), port 6379 published to host. Healthy. Plugin + bridge both connect to `localhost:6379`.
- The squad agents have Python 3 with the `redis` package available in their profile venvs. (Verify with `~/.hermes/profiles/elmo/venv/bin/python -c "import redis"`.)
- Node 22 is available system-wide. (Verify with `node --version`.)
- The jirito server is started via `npm run dev` (tsx) in development, `npm run server` in production. Both modes use the same `server/index.ts` (or built `dist/server/server/index.js`).
- Kyle is the only human who will be using jirito. No concurrent users.
- "Review" status means the agent is done and the work needs human sign-off. Distinct from "QA" or "staging" semantics.
- The "blocked" status in the protocol is approximated with `inprogress` + `labels: ['blocked']`. We will not add a new status value to jirito in v1.

## Dispatch Strategy

I will execute the build in two waves:

**Wave 1 (sequential, Elmo)** — schema, emitter, drainer, CLI, protocol skill
- These touch the jirito codebase and the agent-side protocol. One agent (Elmo) does them in order so we have a clean git diff. I review each phase before the next.
- Estimated: 3-4 hours of Elmo's time, spread across the day.

**Wave 2 (parallel, Elmo + Bert)** — bridge, plugin, review skill
- These are independent components. Bridge (Node service) and plugin (Python Hermes plugin) can be built in parallel by Elmo and a helper. Review skill is just markdown, written by me.
- Estimated: 2 hours.

**Final** — E2E test (Phase 9), run by me with Evo's eyes on the logs.

I will not start the build until you say "go" on this plan.

## Errata & Postmortems

### 2026-06-16: Phase 6.1 — Plugin hardening

After Phase 6 shipped the `jirito-event-injector` plugin, the meta-test surfaced 4 spoof wakes (IDs 120/121/122 with non-numeric PR "A") that bypassed `_handle_event` but matched the plugin's format strings. Phase 6.1 (post-Phase 6, pre-Phase 7) hardened the plugin with two changes:

1. **Format extract** — pulled `_format_review_wake` and `_format_triage_wake` out of `plugin.py` into a new `~/.hermes/plugins/jirito-event-injector/formatting.py` module. Single source of truth, importable by any future sibling emitter. New `format_wake(event_type, payload)` dispatcher included.
2. **Ticket-exists guard** — added `_ticket_exists()` method to `JiritoEventInjector`. In `_handle_event`, after the wake-type/assignee filter and before the dedup/cooldown gate, the guard does a cheap `urllib` GET to `{jirito_url}/api/issues/{id}`. On 404 → wiretap `skipped_unknown_ticket` and drop. Network errors fall through True so infra outages don't block wakes. Non-integer IDs return False immediately.

Plugin bumped to v0.2.0. New config fields: `jirito_url` (default `http://localhost:3001`), `verify_ticket_exists` (default `True`), `verify_timeout_seconds` (default `1.0`).

### 2026-06-16: Verification rigor postmortem (Elmo)

**What happened**: Phase 6.1's verification used test events with ticket IDs 1, 2, 3, 4. Jirito's actual ticket IDs are 101-108. All test events returned 404 from the new guard, and the receipt's "open question" was written as "Jirito server has no tickets" — but the truth was "I picked the wrong test IDs." The guard did its job; the test data was bad. A re-verification by Evo (with real IDs 101, 120, 99999, "not-a-number") confirmed the guard works correctly.

**Process fix for future dispatches**:
- Before writing integration test events, query the real system's data shape: `curl http://localhost:3001/api/issues | jq 'map(.id)'` first.
- Don't trust a green wiretap log without cross-referencing the actual data range.
- When a receipt has an "open question" about data state, verify against ground truth before relaying it.
- A green test + bad test data = false positive. The wiretap is a record of what happened, not proof that what happened was the right thing.
