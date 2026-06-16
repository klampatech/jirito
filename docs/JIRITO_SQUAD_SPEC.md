# Jirito × Squad Integration — Spec

> Companion to `JIRITO_SQUAD_IMPLEMENTATION_PLAN.md`. Read the spec, then the plan.

## JTBD (Job to Be Done)

**When** Kyle files a ticket in jirito, **I want** the squad (Elmo / Bert / Ernie / Grover) to pick it up, work it, and surface it for my review, **so that** I can track all work in one place without checking Discord or polling agents.

## Why

- Today, the squad coordination layer is Discord + pub/sub. Work lives in chat. Status is invisible without asking.
- Jirito is already a personal Kanban with a REST API, SQLite persistence, and a `localhost:3001` server. It's the natural "source of truth" — but currently decoupled from the squad.
- The hookup is bidirectional: squad reads tickets from jirito, squad writes status/comments back. Kyle sees it all in the jirito UI; Evo + squad coordinate via pub/sub underneath.
- Scope: Kyle + Evo + 4 squad agents only. No auth, no multi-tenant, no public exposure. Localhost on m5.

## Topology

```
┌────────────┐  POST /webhook   ┌──────────────────┐  PUBLISH   ┌────────────┐
│  jirito    │ ───────────────► │ jirito-webhook-  │ ─────────► │   Redis    │
│  server    │  (on every       │ bridge (Node,    │  jirito/   │  pub/sub   │
│  :3001     │   write, after   │  :3030)          │  events    │            │
│            │   saveDb)        │                  │            │            │
└─────┬──────┘                  └──────────────────┘            └─────┬──────┘
      │                                                               │
      │  webhooks_outbox                                             │ subscribe
      │  (durable retry table                                        │
      │   in jirito.db)                                              ▼
      │                                                         ┌────────────────┐
      │                                                         │ jirito-event-  │
      │                                                         │ injector       │  inject_synthetic_event
      │                                                         │ (Hermes plugin)│ ────► Evo's next turn
      │                                                         └────────────────┘
      │                                                                 ▲
      │  cron (no_agent, 1m)                                             │
      │  drains outbox pending rows ────────────────────────────────────┘
      │  on retry (re-POST to bridge)
      │
      ▼
┌────────────┐
│ jirito CLI │ (Python, stdlib only, in $PATH)
│  jirito    │
│  show/list │
│  /move/    │
│  comment/  │
│  triage    │
└────────────┘
       ▲
       │ used by
       │
  ┌────┴────┬────────┬────────┐
  │  Elmo   │  Bert  │ Ernie  │ Grover
  │ Coder   │ Arch/  │Research│Creative
  │         │  Spec  │        │
  └─────────┴────────┴────────┘
       │
       │ on dispatch (squad-dispatch-redis.py)
       │ receives task: "JIRITO-107: ..."
       │ loads jirito-squad-protocol skill
       │ follows protocol:
       │   1. jirito show 107
       │   2. jirito move 107 inprogress --assignee <name>
       │   3. do the work
       │   4. jirito move 107 review --pr-url <url>
       │   5. (wait for Evo's review)
```

## Event types on `jirito/events`

| event_type | When | Payload includes | Wakes Evo? |
|---|---|---|---|
| `ticket.created` | New issue inserted | `id, title, description, type, priority, assignee, reporter, labels` | Yes (only if `assignee` is empty → triggers triage) |
| `ticket.moved` | Status changed | `id, from, to, actor, prUrl?` | No (logged to wiretap, posts to #operations on `to=review` only) |
| `ticket.review` | Status changed **to** `review` | `id, title, prUrl, actor, projectId, labels` | **Yes** (wakes Evo to do code/PR review) |
| `ticket.commented` | New comment | `id, issueId, author, content_preview` | No (low-signal; agents poll comments on their own tickets) |

All event envelopes include:
```json
{
  "event_id": "uuid-v4",
  "event_type": "ticket.review",
  "timestamp": "2026-06-15T12:34:56Z",
  "source": "jirito",
  "payload": { ... }
}
```

## Topics

### Topic 1: Webhook Emitter

**Purpose**: jirito server emits a webhook to the bridge on every state-mutating write (issue create/update/delete, comment create/update/delete), after the SQL change has been persisted to disk.

**Requirements**

- MUST R1: After `saveDb()` in any write path, insert a row into `webhook_outbox` with `event_type`, `payload`, `status='pending'`, `attempts=0`, `created_at=now`.
- MUST R2: Immediately after outbox insert, attempt POST to `${JIRITO_WEBHOOK_BRIDGE_URL}/webhook` with the event envelope as JSON body.
- MUST R3: On 2xx response from bridge, mark outbox row `status='delivered'`, `delivered_at=now`.
- MUST R4: On non-2xx, timeout, or connection error, leave outbox row `pending` and increment `attempts` on the next drainer cycle (drainer handles retry — emitter does not retry inline).
- MUST R5: Webhook emitter must NOT block the HTTP response to the client. POST attempt is fire-and-forget from the response's perspective — outbox row is the source of truth.
- MUST R6: All event payloads exclude the `id` of the outbox row, the database row id, or any internal sequencing — the bridge does not need them.
- MUST R7: `event_id` is a UUID v4 generated at outbox-insert time. The same `event_id` is preserved across retries so the bridge / Redis subscriber can dedupe.
- SHOULD R8: Webhook emitter is configurable via `JIRITO_WEBHOOK_ENABLED` env var (default `true`). When `false`, outbox rows are still inserted for visibility but POST is skipped.
- SHOULD R9: Webhook payload for `ticket.moved` includes `from` and `to` statuses, computed by reading the row before and after the update (not by diffing in the bridge).

**Behavior**

```
Given a write to /api/issues (POST, PUT, or DELETE)
When saveDb() completes successfully
Then:
  1. emitter computes event_type and payload from the change
  2. emitter inserts webhook_outbox row
  3. emitter fires async POST to bridge
  4. HTTP response to client is sent (the request must not block on the POST)
  5. POST result updates the outbox row asynchronously
```

**Edge Cases**

- EC1: Bridge is down (connection refused). POST fails fast (< 1s), outbox row stays `pending`, drainer retries.
- EC2: Bridge returns 5xx. Outbox row stays `pending`, drainer retries with backoff.
- EC3: saveDb() fails. No outbox row, no POST. The HTTP response is a 500. (Database is the source of truth; webhook is best-effort.)
- EC4: Outbox insert fails (DB locked). Log error, do not POST. Drainer re-attempts to insert? No — this is a hard error. Logged for investigation.
- EC5: Webhook enabled but no `JIRITO_WEBHOOK_BRIDGE_URL` set. Use default `http://localhost:3030`. If unreachable, log a warning at boot and continue (don't crash jirito).
- EC6: Rapid succession of writes (bulk import). Outbox accumulates; each gets its own POST. No batching in v1.

**Acceptance Criteria**

- AC1: Creating a ticket triggers one outbox row with `event_type='ticket.created'` and one POST attempt.
- AC2: PUT that changes status from `inprogress` to `review` triggers one outbox row with `event_type='ticket.review'` AND one with `event_type='ticket.moved'` (both events fire).
- AC3: Killing the bridge mid-write does not break jirito's HTTP responses — outbox rows accumulate pending and are drained when bridge comes back.

**Out of Scope**

- Webhook signing / HMAC (localhost-only, trusted environment)
- Webhook subscription management UI
- Replay API (covered indirectly by the outbox drainer)
- Bulk batching of events

---

### Topic 2: Outbox & Retry

**Purpose**: Durable queue for webhook delivery. Decouples jirito writes from bridge availability. Survives bridge restarts, m5 reboots, and network blips without losing events.

**Requirements**

- MUST R1: New SQLite table `webhook_outbox` with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE, event_type TEXT, payload TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, last_attempt_at TEXT, delivered_at TEXT, last_error TEXT, created_at TEXT DEFAULT (datetime('now'))`.
- MUST R2: Index on `(status, created_at)` for drainer queries.
- MUST R3: Drainer script `scripts/drain-outbox.js` runs as `no_agent` cron job every 60 seconds.
- MUST R4: Drainer selects up to 50 rows where `status='pending'` AND `attempts < 10` AND `created_at < now() - 30s` (don't race the emitter's immediate POST).
- MUST R5: For each selected row, POST to bridge with original payload. On 2xx, update `status='delivered'`, `delivered_at=now`. On non-2xx, increment `attempts`, set `last_attempt_at=now`, set `last_error=<response or error message>`, leave `status='pending'`.
- MUST R6: Backoff: rows where `attempts >= 3` are only re-attempted after `last_attempt_at + (attempts * 30s)` — exponential backoff capped at 10 minutes.
- MUST R7: Rows where `attempts >= 10` are marked `status='dead'` and logged to `~/.hermes/logs/jirito-outbox-dead.log`. Drainer stops attempting them.
- MUST R8: Drainer exit code: 0 if no work, 0 if all delivered, 1 if any rows hit errors. (Cron delivery: silent on 0, alert on 1.)
- SHOULD R9: Drainer logs a one-line summary to stdout: `drained N delivered, M still pending, K dead`.
- COULD R10: CLI command `jirito outbox` to inspect the outbox (for debugging).

**Behavior**

```
Given bridge was down for 5 minutes
When bridge comes back up
Then within 60s, drainer sends all accumulated pending rows
And marks them delivered (or increments attempts if bridge still 5xx)
```

**Edge Cases**

- EC1: Drainer runs while bridge is being restarted. Expect transient connection refused; backoff handles it.
- EC2: Outbox grows unbounded if bridge is permanently down. After 10 attempts per row (~30 min), rows go to `dead` and stop retrying. Manual intervention required.
- EC3: Two drainer instances run concurrently (cron misfire). SQLite serializes writes; the second instance's POST attempts may be redundant but not harmful. Bridge dedupes by `event_id`.
- EC4: Outbox row's `event_id` already delivered (rare race). Skip with `WHERE event_id NOT IN (SELECT event_id FROM webhook_outbox WHERE status='delivered')` — or just rely on bridge-side dedup.

**Acceptance Criteria**

- AC1: Killing the bridge, creating 3 tickets, restarting the bridge → within 90s all 3 events arrive in Redis.
- AC2: Drainer cron exits 0 when no work, 0 when all work succeeds, 1 when any row errored.
- AC3: A row with `attempts=10` is marked `dead` and never re-attempted by the drainer.

**Out of Scope**

- Dead-letter UI in jirito (use `jirito outbox` CLI or raw SQL)
- Webhook replay endpoint
- Multi-bridge fanout (one bridge only in v1)

---

### Topic 3: Webhook Bridge

**Purpose**: Standalone Node service that receives HTTP webhooks from jirito, publishes to Redis pub/sub on `jirito/events`, and provides a health endpoint.

**Requirements**

- MUST R1: New directory `bridge/` at the jirito repo root, with its own `package.json` (deps: `redis` only), `server.js`, `README.md`.
- MUST R2: HTTP server listens on port 3030 (override with `BRIDGE_PORT` env var). Binds to `127.0.0.1` only.
- MUST R3: `POST /webhook` accepts JSON body with `{ event_id, event_type, timestamp, source, payload }`. Validates `event_id` and `event_type` are non-empty strings; returns `400` on validation failure.
- MUST R4: On valid POST, publish to Redis channel `jirito/events` using `redis` npm package. Use `PUBLISH` (not `RPUSH`); pub/sub is fire-and-forget.
- MUST R5: Return `200` after successful publish. Return `503` if Redis is unreachable. Return `400` on validation failure.
- MUST R6: `GET /health` returns `200` with `{ status: 'ok', redis: 'connected'|'disconnected' }`.
- MUST R7: Redis connection is established on boot, retried with exponential backoff on disconnect (max 5s between attempts). All publishes await a healthy connection.
- MUST R8: Bridge logs structured JSON to stdout: `{ ts, level, msg, event_id?, event_type?, status? }`. Levels: `info`, `warn`, `error`.
- MUST R9: Graceful shutdown on `SIGINT`/`SIGSIGTERM` — close Redis, close HTTP server, exit 0.
- SHOULD R10: Bridge deduplicates by `event_id` in-memory (LRU cache, 1000 entries) to absorb retries from the drainer that arrived after the original POST already succeeded. Cache is per-process; not shared across instances.
- SHOULD R11: Bridge exposes Prometheus-style metrics on `GET /metrics`: `webhook_received_total{event_type}`, `webhook_published_total{event_type}`, `webhook_failed_total{event_type, reason}`.

**Behavior**

```
Given jirito POSTs { event_id: 'abc', event_type: 'ticket.review', payload: {...} }
When the bridge receives it
Then:
  1. Bridge validates event_id and event_type are present
  2. Bridge checks in-memory dedup cache; if seen, return 200 immediately
  3. Bridge publishes to Redis channel 'jirito/events'
  4. Bridge returns 200 with { status: 'published', event_id: 'abc' }
  5. Bridge logs: { level: 'info', msg: 'published', event_id: 'abc', event_type: 'ticket.review' }
```

**Edge Cases**

- EC1: Redis is down at bridge boot. Bridge logs warning, retries every 5s, accepts webhooks (returns 503) until Redis is up. jirito's outbox catches this.
- EC2: Malformed JSON body. Return 400 with `{ error: 'invalid json' }`. Do not log the body (could be sensitive).
- EC3: Payload size > 1MB. Return 413. (Shouldn't happen with jirito's data model, but guard anyway.)
- EC4: Webhook arrives with `event_id` already in the cache. Return 200 silently (idempotent retry).
- EC5: Two bridge instances running on the same port. Second fails to bind, exits 1.

**Acceptance Criteria**

- AC1: `curl -X POST http://localhost:3030/webhook -d '{...valid...}'` returns 200 within 100ms when Redis is healthy.
- AC2: `redis-cli SUBSCRIBE jirito/events` shows the published message in real time.
- AC3: Killing Redis, POSTing a webhook → bridge returns 503, does not crash, resumes publishing when Redis comes back.
- AC4: `GET /health` returns 200 with `redis: 'connected'` when healthy.

**Out of Scope**

- HTTPS / TLS (localhost only)
- Authentication / API keys (localhost only)
- Webhook signing (localhost only)
- Persistent storage (pub/sub is fire-and-forget; outbox in jirito is the source of truth)
- Multi-channel publishing (one channel: `jirito/events`)

---

### Topic 4: Evo Wake Injector Plugin

**Purpose**: Hermes plugin that subscribes to `jirito/events` on Redis and calls `ctx.inject_synthetic_event()` to wake Evo at the right times. Mirrors the `squad-relay` plugin pattern for `squad/events`.

**Requirements**

- MUST R1: New plugin at `~/.hermes/plugins/jirito-event-injector/` with `plugin.py`, `plugin.yaml`, `__init__.py`.
- MUST R2: Plugin subscribes to `jirito/events` on Hermes boot. Connection auto-reconnects with exponential backoff.
- MUST R3: On `ticket.review` event: call `ctx.inject_synthetic_event(chat_id=<home>, text="[JIRITO REVIEW] #<id>: <title>\npr_url: <prUrl>\nactor: <actor>\n\nUse `jirito show <id>` to read full ticket. Then review the PR, decide pass/fail, and follow the jirito-review skill protocol.")`
- MUST R4: On `ticket.created` event where `payload.assignee` is empty: call `ctx.inject_synthetic_event(chat_id=<home>, text="[JIRITO TRIAGE] #<id>: <title>\n\nNew unassigned ticket. Pick an agent (elmo/bert/ernie/grover) based on content, then dispatch via squad-dispatch-redis.py with a JIRITO-N: brief.")`
- MUST R5: Dedupe by `event_id` (LRU cache, 5000 entries, 1h TTL). Same event arriving twice (e.g. drainer retry) only wakes once.
- MUST R6: Wiretap log: append every event (including non-waking) to `~/.hermes/logs/jirito-event-injector-wiretap.log` for debugging.
- MUST R7: Per-channel cooldown: don't inject more than one synthetic event per channel per 2 seconds. Prevents flood-waking when many tickets complete simultaneously.
- MUST R8: Configurable `wake_on` list in `plugin.yaml` (default: `['ticket.review', 'ticket.created']`). Setting to `[]` makes the plugin a passive observer (wiretap only).
- SHOULD R9: Plugin also posts a one-liner to `#operations` on `ticket.review` events, parallel to squad-relay's courtesy post: `[JIRITO] #<id> <title> → review by <actor>. PR: <prUrl>`. (Optional — Evo's wake is the primary signal.)
- SHOULD R10: Plugin includes a small "system status" message at boot summarizing config.

**Behavior**

```
Given a 'ticket.review' event arrives on jirito/events with id=107, prUrl=https://github.com/...
When the plugin receives it
Then:
  1. Plugin checks dedup cache; if new, continue
  2. Plugin checks cooldown; if within 2s of last wake, queue (don't drop — fire after cooldown)
  3. Plugin calls ctx.inject_synthetic_event with formatted wake text
  4. Plugin logs to wiretap
  5. Plugin optionally posts to #operations
```

**Edge Cases**

- EC1: Redis disconnects mid-subscribe. Auto-reconnect; events during the gap are missed (acceptable — jirito's outbox is the recovery path, but we don't replay from there in v1; that's v2).
- EC2: `ctx.inject_synthetic_event` returns False (e.g. CLI mode not active). Log warning, don't retry.
- EC3: `chat_id` is unknown. Log error, don't inject.
- EC4: Event payload missing `prUrl` on `ticket.review`. Wake text omits the line; Evo's review skill handles PR-less tickets (e.g. Bert's spec).

**Acceptance Criteria**

- AC1: A test event published to `jirito/events` results in a `[JIRITO REVIEW]` synthetic event visible in Evo's next turn.
- AC2: Publishing the same `event_id` twice results in only one wake (dedup works).
- AC3: Plugin survives a Redis restart and resumes subscribing.

**Out of Scope**

- Replaying events from jirito's outbox table (outbox is jirito's recovery story, not the plugin's)
- Discord bot integration (squad-relay already posts to #operations for `task.completed`; jirito events piggyback on the same channel)
- Per-project or per-label filtering (all jirito events wake by default; gating is a v2 feature)

---

### Topic 5: Jirito CLI

**Purpose**: Ergonomic command-line wrapper around the jirito REST API for squad agents. Avoids raw `curl` in agent scripts. Idempotent, safe to re-run, sub-second to invoke.

**Requirements**

- MUST R1: Single Python 3.10+ file at `bin/jirito`, stdlib only (no pip installs). Shebang `#!/usr/bin/env python3`.
- MUST R2: Subcommands: `show <id>`, `list [--status=…] [--assignee=…]`, `create --title=… [--type=…] [--priority=…] [--assignee=…] [--reporter=…] [--labels=…]`, `move <id> <status> [--assignee=…] [--pr-url=…]`, `comment <id> --text=… --author=…`, `activity <id> --action=… [--details=…]`, `mine <agent>`, `triage <id> --agent=…`, `block <id> --reason=…`, `unblock <id>`, `outbox [--status=…]`.
- MUST R2a: `block` looks up the custom column named `Blocked` via `GET /api/columns?name=Blocked`, caches the id in `~/.config/jirito/blocked-column-id`, and PUTs the issue with `customColumnId=<id>`. Falls back to a fresh lookup if the cached column id no longer exists.
- MUST R2b: `unblock` clears `customColumnId` (set to `null`) and reverts `status` to its prior value. CLI remembers the pre-block status per ticket in a small local cache (`~/.config/jirito/issue-status-cache.json`).
- MUST R3: Reads `JIRITO_URL` env var (default `http://localhost:3001`). Connection timeout 5s.
- MUST R4: `move` with `--pr-url` writes to the `prUrl` field; without it leaves it untouched.
- MUST R5: `triage` updates the ticket's `assignee` field and posts a `ticket.created`-like event to the outbox (via the normal API; no special endpoint).
- MUST R6: Exit code 0 on success, 1 on API error, 2 on usage error.
- MUST R7: Output is human-readable by default (`<id> <status> <assignee> <title>` for list). `--json` flag returns raw API JSON.
- MUST R8: Idempotency: `move 107 inprogress` when already `inprogress` is a no-op (returns success, does not double-fire event). `comment` always appends (comments are not idempotent).
- SHOULD R9: `list` colorizes status with terminal ANSI codes (green=done, yellow=inprogress, blue=review, gray=backlog/todo).
- SHOULD R10: `bin/jirito` is symlinked to `~/.local/bin/jirito` (in $PATH) by the install step in the implementation plan.
- COULD R11: Bash completion via `eval "$(jirito completion bash)"`.

**Behavior**

```
Given the jirito server is running on localhost:3001
When the user runs `jirito list --status=review`
Then the CLI prints a list of all tickets with status=review, one per line:
  → [ 107] review     elmo       Hook jirito to squad
  → [ 109] review     ernie      Research webhooks comparison
```

**Edge Cases**

- EC1: jirito is down (connection refused). CLI prints clear error to stderr, exits 1.
- EC2: Ticket ID doesn't exist. CLI prints `issue 999 not found`, exits 1.
- EC3: `move` with invalid status. CLI prints valid statuses, exits 2.
- EC4: `triage` with unknown agent name. CLI prints valid agents (elmo, bert, ernie, grover), exits 2.

**Acceptance Criteria**

- AC1: All 11 subcommands work end-to-end against a running jirito server.
- AC2: CLI invocation takes < 200ms when server is local.
- AC3: `jirito list --json` returns valid JSON parseable by `jq`.
- AC4: Missing `JIRITO_URL` env var uses the default and works.

**Out of Scope**

- TUI / interactive mode (CLI is for agent scripts; humans use the jirito web UI)
- Bulk operations (`jirito bulk-move ...`) — agents do this via the API directly if needed
- Offline mode (CLI assumes jirito is reachable)

---

### Topic 6: Routing & Triage

**Purpose**: Decide which squad agent gets a ticket. Two-tier routing — explicit `assignee` field, fallback to Evo's LLM-based triage.

**Requirements**

- MUST R1: Routing decision is made by the dispatcher, not by jirito. jirito's role is to surface unassigned tickets; the dispatcher (Evo, or a cron) reads them and picks an agent.
- MUST R2: If a ticket's `assignee` field is set to one of `elmo`, `bert`, `ernie`, `grover`, dispatch to that agent.
- MUST R3: If `assignee` is empty AND no other routing signal, the ticket wakes Evo via the `ticket.created` event. Evo reads the ticket, picks an agent based on content, and dispatches.
- MUST R4: Triage decision criteria (Evo's prompt — preserved in the jirito-triage skill):
  - `bug` or `task` with implementation/code/feature/devops/testing keywords → **Elmo**
  - `story` with spec/architecture/design/system/pattern/plan → **Bert**
  - `story` with research/analyze/investigate/compare/survey/benchmark → **Ernie**
  - `story` with copy/brand/creative/messaging/voice/tone/naming → **Grover**
  - Ambiguous or multi-domain → pick the primary one based on the title and first 200 chars of description. State reasoning in the dispatch brief.
- MUST R5: Triage dispatcher writes the chosen `assignee` to jirito via `PUT /api/issues/:id` before dispatching. The squad agent then sees the ticket as assigned-to-them when they `jirito show <id>`.
- MUST R6: If Evo is uncertain between two agents, she comments on the ticket first: `jirito comment <id> --text="Routing to <agent> because <reason>" --author=evo` — then dispatches.
- SHOULD R7: Triage decision is recorded in the dispatch brief so the agent has context: `JIRITO-107: <title>\n\nRouted to you by Evo: <reason>`. Audit trail in the agent's `task.completed` event.
- COULD R8: A "re-route" command in the CLI: `jirito route <id> <new-agent>` — moves the ticket and re-dispatches with context from the previous attempt. (v2 — not needed for v1.)

**Behavior**

```
Given a new ticket #107 is created with title "Fix auth token refresh bug" and no assignee
When the ticket.created event fires
Then:
  1. Plugin wakes Evo
  2. Evo reads the ticket via jirito show 107
  3. Evo's triage: title contains "fix" + "bug" → Elmo
  4. Evo runs: jirito move 107 todo --assignee elmo
  5. Evo runs: squad-dispatch-redis.py elmo "JIRITO-107: ..."
  6. Elmo's next turn starts with the JIRITO-107 brief
```

**Edge Cases**

- EC1: `assignee` is set to a non-agent name ("Alice", "Bob" — legacy sample data). Dispatcher treats as unassigned and triages.
- EC2: Evo's triage LLM call fails. Retry once; if still fails, post a comment on the ticket (`Evo triage failed: <error> — Kyle, please assign manually`) and alert #operations.
- EC3: Ticket is created and immediately assigned by Kyle via the jirito UI before the `ticket.created` event reaches Evo. By the time Evo wakes, `assignee` is set. Evo sees it, does nothing. (Idempotent: no double-dispatch.)
- EC4: Agent's CLI can't reach jirito (rare; both are localhost on m5). Agent reports failure in `task.completed` payload. Evo re-dispatches or escalates.

**Acceptance Criteria**

- AC1: A ticket with `assignee=bert` is dispatched to Bert, not triaged.
- AC2: A ticket with no assignee and title "Write API spec for auth flow" is dispatched to Bert by Evo's triage.
- AC3: After triage, the ticket's `assignee` field reflects the chosen agent.

**Out of Scope**

- Skill-based routing (no `agent:elmo` labels — the only signal is the `assignee` field)
- Round-robin / load-balancing
- Per-project routing tables
- Manual override UI in jirito (Kyle uses the existing UI to set `assignee`)

---

### Topic 7: Squad Agent Protocol

**Purpose**: Define the contract for how squad agents read, work, comment, and move tickets. Loaded as a skill by all 4 agent profiles when they receive a `JIRITO-N:` task.

**Requirements**

- MUST R1: New skill at `~/.hermes/skills/jirito-squad-protocol/SKILL.md` with frontmatter `trigger: ALWAYS load this skill when a dispatched task starts with "JIRITO-"`.
- MUST R2: Protocol sequence (agents MUST follow this order):
  1. `jirito show <id>` — read the full ticket
  2. `jirito move <id> inprogress --assignee <self>` — claim it
  3. `jirito comment <id> --text="Starting" --author=<self>` — sign your work
  4. Do the work (code, spec, research, creative)
  5. For Elmo: at end of work, `gh pr create` and capture the PR URL
  6. For Bert/Ernie/Grover: at end of work, write the deliverable to `~/squad-output/jirito-triage/JIRITO-<id>/<deliverable>` and capture the path
  7. `jirito comment <id> --text="<summary of work done>" --author=<self>` — progress note
  8. `jirito move <id> review --pr-url=<url-or-path>` — surface for review
  9. Stop. Do not self-complete. Wait for Evo's review.
- MUST R3: Pitfalls section in the skill:
  - **No PR?** Ask Kyle via `jirito comment <id> --text="Need a target repo/branch for the PR" --author=<self>` and move to `blocked` (a new status). Do not invent a PR URL.
  - **Already in progress by another agent?** Run `jirito mine <self>`. If your ID is in the list, proceed. If not, check the assignee — if it's not you, post a comment and stop.
  - **Blocked on missing info?** `jirito comment <id> --text="…reason…" --author=<self>`, then `jirito block <id> --reason="…"`. This moves the ticket into the Blocked custom column. Post `task.failed` to `squad/events` and stop.
  - **The work took multiple sessions** (context exhausted)? Just continue — jirito is the source of truth, not the conversation history.
- MUST R4: Skill uses the **custom-column "Blocked"** (created by Kyle in the jirito UI) for blocked tickets, not a new status value. The CLI subcommand `jirito block <id> --reason="…"` looks up the column by name and sets `customColumnId`. `jirito unblock <id>` clears it. **No schema migration needed** — custom columns already exist in jirito.
- MUST R5: Skill is loaded by all 4 squad profiles (Elmo, Bert, Ernie, Grover). The trigger pattern is checked at the start of every dispatch.
- SHOULD R6: Skill includes a "first time" preamble that explains the jirito system to an agent that hasn't seen it before.
- SHOULD R7: Skill includes example commands for each step (copyable, runnable).

**Behavior**

```
Given Elmo receives dispatch "JIRITO-107: Hook jirito to squad"
When Elmo's turn starts
Then:
  1. jirito-squad-protocol skill auto-loads
  2. Elmo runs jirito show 107 — sees full ticket
  3. Elmo runs jirito move 107 inprogress --assignee elmo
  4. Elmo runs jirito comment 107 --text="Starting integration work" --author=elmo
  5. Elmo does the work
  6. Elmo runs gh pr create, captures URL https://github.com/.../pull/42
  7. Elmo runs jirito comment 107 --text="PR opened: ..." --author=elmo
  8. Elmo runs jirito move 107 review --pr-url=https://github.com/.../pull/42
  9. Elmo emits task.completed and stops
  10. ticket.review event fires, plugin wakes Evo
  11. Evo reviews the PR, decides pass/fail
```

**Edge Cases**

- EC1: Agent crashes mid-work. Ticket is stuck at `inprogress`. A recovery cron (out of scope for v1; manual fix in v1) would re-dispatch. For v1: Kyle sees it in jirito UI and can re-trigger.
- EC2: Agent's PR URL is to a fork, not the upstream repo. Evo's review skill handles this — fetches the diff from the fork.
- EC3: Multiple agents pick up the same ticket (race). The CLI's `move` is the latest-write-wins. Whoever moves last claims it. Other agent sees the assignee changed and stops.

**Acceptance Criteria**

- AC1: Dispatching a fake JIRITO-N task to Elmo results in a ticket moving through `inprogress` → `review` with a PR URL.
- AC2: All 4 agents load the protocol skill when their dispatched task starts with `JIRITO-`.
- AC3: An agent that can't find the PR target posts a `blocked` comment and stops, rather than fabricating a URL.

**Out of Scope**

- Agent-to-agent handoff (Evo routes, not the agents)
- Multi-PR tickets (one PR per ticket in v1)
- Re-attempt logic (Evo handles re-dispatch on review-fail)

---

### Topic 8: Review Flow

**Purpose**: Define what happens after an agent moves a ticket to `review`. Evo reviews the work, alerts Kyle on pass, auto-re-dispatches on fail.

**Requirements**

- MUST R1: New skill at `~/.hermes/skills/jirito-review/SKILL.md` auto-loads on `[JIRITO REVIEW]` synthetic events. Documents Evo's review protocol.
- MUST R2: Evo's review protocol (on wake):
  1. `jirito show <id>` — re-read the ticket (state may have shifted)
  2. Read all comments on the ticket
  3. If `prUrl` is HTTP(S): fetch the PR (or use `gh pr view <url>` or curl), read the diff
  4. If `prUrl` is `path:…`: read the deliverable file
  5. If `prUrl` is empty (Bert/Ernie/Grover's spec/research/creative deliverable): read the receipt at `~/squad-output/jirito-triage/JIRITO-<id>/<agent>.json` and any deliverable files referenced
  6. Check ticket acceptance criteria (read the description; agents should have written "Acceptance:" lines but if not, use the title)
  7. Run any verification commands the agent claims to have run (e.g. re-run `npm test`)
  8. Decide: pass or fail
- MUST R3: On pass:
  - Post a one-liner to `#operations`: `🟢 JIRITO-<id> ready for sign-off — <one-line verdict>. PR: <url>`
  - Move the ticket to `done` automatically? **No** — leave it at `review` so Kyle can sign off manually. **See Open Question 2**.
  - Comment on the ticket: `jirito comment <id> --text="Evo review: <verdict>" --author=evo`
- MUST R4: On fail:
  - `jirito move <id> inprogress --assignee=<original-agent>` — kick it back
  - `jirito comment <id> --text="Evo review (rejected): <specific feedback>" --author=evo` — written feedback
  - Re-dispatch the same agent with the feedback as new context: `squad-dispatch-redis.py <agent> "JIRITO-<id> re-dispatch: <original title>\n\nEvo rejected because: <feedback>\n\nRead the latest comments, fix, and re-surface for review."`
- MUST R5: All Evo review actions emit `ticket.review`-like activity entries (via the activity endpoint) for an audit trail.
- MUST R6: Review cooldown: Evo doesn't review the same ticket more than 3 times in a row. After 3 rejections, escalate to Kyle in #operations: `🔴 JIRITO-<id> stuck — rejected 3 times. Manual intervention needed. Last feedback: <latest>`.
- SHOULD R7: Evo's review verdict is recorded as an activity entry with `action='review'` and `details={verdict, feedback, pr_reviewed}`.

**Behavior**

```
Given Elmo moves JIRITO-107 to review with prUrl=https://github.com/.../pull/42
When the ticket.review event wakes Evo
Then:
  1. Evo reads ticket, comments, and the PR diff
  2. Evo decides: pass (code is good, tests pass)
  3. Evo posts: 🟢 JIRITO-107 ready for sign-off — Auth refresh logic is correct...
  4. Evo comments on ticket: "Evo review: pass. All tests green, diff is clean."
  5. Ticket stays at 'review' (Kyle moves to 'done' manually)
  6. Kyle sees the message in #operations, opens the PR, signs off in jirito UI
```

**Edge Cases**

- EC1: PR URL is private / requires auth Evo doesn't have. Evo posts a comment: `Can't fetch PR — auth issue. Kyle, please review directly.`, alerts #operations.
- EC2: PR has merge conflicts. Evo notes this in the review, marks as fail with feedback "Resolve conflicts before re-review."
- EC3: Agent's deliverable is on a different machine / external link. Evo flags in the review, asks Kyle to verify.
- EC4: Evo's review itself fails (LLM error, timeout). The synthetic event was delivered but no action was taken. **Recovery**: a 5-minute cron polls for tickets in `review` for more than 10 minutes without an Evo review activity entry, and re-wakes Evo.

**Acceptance Criteria**

- AC1: A `ticket.review` event results in Evo reading the PR and posting a sign-off message to #operations within 2 minutes.
- AC2: A rejected review results in the ticket moving back to `inprogress` and a re-dispatch to the same agent.
- AC3: After 3 consecutive rejections, Evo escalates to Kyle in #operations and stops auto-re-dispatching.

**Out of Scope**

- Kyle's sign-off action (manual, in jirito UI; he moves `review` → `done`)
- Auto-promotion to `done` (per Open Question 2, the spec calls for staying at `review`)
- Multi-reviewer support (Evo is the only reviewer)
- Code quality scoring / grading

---

## Cross-Cutting Concerns

### Authentication & Security

- **None.** All services run on `127.0.0.1` on m5. No auth, no signing, no CORS restrictions beyond jirito's existing `CLIENT_ORIGIN=*` (which is fine for localhost).
- Bridge binds to `127.0.0.1` only; never `0.0.0.0`.
- This is acceptable because the threat model is "trusted local user" (Kyle). If the threat model changes, add HMAC signing on the webhook and API keys for the bridge.

### Failure Modes

| Failure | Detection | Recovery |
|---|---|---|
| jirito crashes | no HTTP response | restart; outbox picks up where it left off |
| Bridge crashes | drainer's POST fails | restart; drainer retries pending rows |
| Redis crashes | bridge can't publish | bridge returns 503; outbox accumulates; resume when Redis back |
| Plugin crashes (Evo's Hermes) | no wakes | restart Hermes; missed events not recovered (out of scope for v1) |
| Agent crashes mid-work | ticket stuck at `inprogress` | manual fix in v1; auto-recovery cron is v2 |
| sql.js database corruption | jirito errors out | restore from backup; jirito currently has no backup (out of scope to add) |

### Observability

- **Wiretap logs** (one per subscriber): `~/.hermes/logs/jirito-event-injector-wiretap.log`, `~/.hermes/logs/jirito-outbox-dead.log`
- **Drainer stdout**: captured by cron, alert on exit code 1
- **Bridge logs**: structured JSON to stdout
- **jirito webhooks**: logged in jirito's existing console with `[webhook]` prefix
- **Evo review activity**: written to jirito's `activity` table with `author=evo`

### Configuration

| Env var | Default | Set by |
|---|---|---|
| `JIRITO_URL` | `http://localhost:3001` | squad agent profiles (via CLI default) |
| `JIRITO_WEBHOOK_BRIDGE_URL` | `http://localhost:3030` | jirito server boot |
| `JIRITO_WEBHOOK_ENABLED` | `true` | jirito server boot |
| `BRIDGE_PORT` | `3030` | bridge boot |
| `JIRITO_DB_PATH` | `./jirito.db` | jirito server boot (existing) |
| `JIRITO_OUTBOX_DRAIN_INTERVAL` | `60` (seconds) | drainer cron schedule |

### File Locations

| Component | Path |
|---|---|
| Spec (this doc) | `~/Development/jirito/docs/JIRITO_SQUAD_SPEC.md` |
| Implementation plan | `~/Development/jirito/docs/JIRITO_SQUAD_IMPLEMENTATION_PLAN.md` |
| Webhook emitter (jirito) | `~/Development/jirito/server/webhooks.ts` |
| Webhook bridge | `~/Development/jirito/bridge/` |
| Drainer script | `~/Development/jirito/scripts/drain-outbox.js` |
| Jirito CLI | `~/Development/jirito/bin/jirito` |
| Evo wake injector plugin | `~/.hermes/plugins/jirito-event-injector/` |
| Squad protocol skill | `~/.hermes/skills/jirito-squad-protocol/SKILL.md` |
| Evo review skill | `~/.hermes/skills/jirito-review/SKILL.md` |
| Drainer cron | (cron job, id TBD) |

---

## Open Questions

1. **`blocked` representation** — **RESOLVED 2026-06-15**: use a custom column named "Blocked" in the jirito UI. Kyle creates the column manually (no schema migration). Agents move tickets into the column via the `jirito block` CLI subcommand. No jirito schema change required.

2. **Auto-promote to `done` on pass** — **RESOLVED 2026-06-15**: stay at `review` for Kyle's manual sign-off. Evo posts a sign-off line to `#operations` and comments on the ticket; ticket status does NOT change. Kyle moves `review` → `done` in the jirito UI.

3. **Bridge supervisor** — **RESOLVED 2026-06-15**: user systemd unit at `~/.config/systemd/user/jirito-bridge.service` (matches Kyle's pattern — `squad-relay`, `squad-agent-inbox-*`, `hermes-gateway-*`, etc. all use user units). No `nohup`, no system unit.

4. **What if the agent's PR is in a fork?** — current spec says Evo fetches the PR diff. If the fork is private, this fails. **Default: flag in review, escalate to Kyle.**

5. **What if the squad agent's existing SOUL.md says "do not @tag Evo"?** — jirito is a new channel. The protocol skill explicitly tells agents to `jirito move` and `jirito comment`. No conflict, but should double-check the wording. **Default: protocol skill is authoritative; SOUL.md unchanged.**

6. **The wiretap log rotation** — squad-relay rotates at 10MB. The jirito-event-injector wiretap should match. **Default: same threshold.**

7. **`/api/columns` route** — jirito's `columns` table exists but has no API. The `jirito block` CLI needs to look up the Blocked column by name. **Resolution: add a small CRUD route in Phase 1 (mirrors `issues` route shape).**

---

## Out of Scope (whole project)

- Multi-tenant / auth
- Web UI changes to jirito (the existing UI is the human interface; the squad uses the API + CLI)
- Bidirectional comment wakes (Kyle's comments don't wake agents; agents poll on their next action)
- PR auto-merge
- Sprint planning UI
- Notification preferences
- Mobile app
- HTTPS / TLS
- Webhook signing
- Replay API
- Backup of `jirito.db` (out of scope but worth flagging — sql.js is in-memory + disk save, no WAL)
