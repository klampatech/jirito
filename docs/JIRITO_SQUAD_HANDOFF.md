# Jirito × Squad Integration — Session Handoff

> Hand-off for a fresh session. If you're picking this up cold, read this file first, then `JIRITO_SQUAD_SPEC.md`, then `JIRITO_SQUAD_IMPLEMENTATION_PLAN.md`. This file is the index; the other two are the substance.

## TL;DR

We're hooking **jirito** (Kyle's personal Kanban) to **The Squad** (Elmo / Bert / Ernie / Grover) so tickets Kyle files flow through the squad automatically, with status changes reflected in jirito in real time. Squad agents read tickets via a CLI, work them, and surface for review. Evo reviews PRs and alerts #operations. Kyle signs off manually. No code built yet — only the spec, plan, and design decisions. Build is 9 phases, ~1 working day, mostly dispatchable to Elmo.

## Project location

```
~/Development/jirito/                        # the jirito codebase (Node + sql.js)
~/Development/jirito/docs/
  ├── JIRITO_SQUAD_SPEC.md                   # 8 topics, each with MUST/SHOULD/COULD, Gherkin, edge cases, AC
  ├── JIRITO_SQUAD_IMPLEMENTATION_PLAN.md    # 9 phases, exact commands, verification checklists
  └── JIRITO_SQUAD_HANDOFF.md                # this file
```

The jirito codebase already has a full REST API on `localhost:3001` and SQLite persistence. We are **adding** to it (webhook emitter, outbox, columns route) and **building adjacent** to it (bridge, plugin, CLI, skills).

## Confirmed design decisions (2026-06-15)

| # | Decision | Implication |
|---|---|---|
| 1 | Routing: **assignee field only** OR Evo's LLM triage. No type-based routing. | Spec Topic 6 — dispatcher checks `assignee`, falls back to Evo's content-based triage. |
| 2 | Custom column for `Blocked` (not a new status value). Kyle creates the column in jirito UI. | Spec Topic 7 + 5 — `jirito block <id> --reason=…` uses `/api/columns` lookup. No schema change. |
| 3 | **Stay at `review`** on pass. Kyle manually moves to `done` in jirito UI. | Spec Topic 8 — Evo never auto-promotes. |
| 4 | Review-fail: **auto-re-dispatch** the same agent with feedback. No human-in-loop. | Spec Topic 8 — Evo kicks back via `squad-dispatch-redis.py`. 3-strikes escalates to Kyle. |
| 5 | Sign-off alert: **`#operations` Discord channel** (1504229121981415464). | Spec Topic 8 — `🟢 JIRITO-N ready for sign-off — <verdict>`. |
| 6 | Bridge supervisor: **user systemd unit** (`~/.config/systemd/user/jirito-bridge.service`). | Plan Phase 3 — matches the pattern of every other Kyle service. |
| 7 | All on **m5**, `127.0.0.1` only. | No auth, no TLS, no remote. |
| 8 | Status transitions: `backlog → todo → inprogress → review → done`. `blocked` is a separate custom column, not a status. | `jirito move` accepts the 5 standard statuses; `jirito block` sets `customColumnId` to the Blocked column id. |

## Current state

- **Spec** — written, reviewed, decisions baked in. 614 lines.
- **Plan** — written, reviewed, decisions baked in. 485 lines.
- **This handoff** — written. 1 file.
- **No code built yet.** No git branches. No services running.
- **No commits made.** All work happens in `~/Development/jirito/` working tree.

The jirito server may or may not be running. `ps -ef | grep "tsx server/index.ts"` — kill it before building (the new schema needs `npm run dev` to pick it up).

## Infrastructure verified

| Service | Status | Where | Notes |
|---|---|---|---|
| Redis | **8.8.0, healthy** | Docker container `redis-squad`, port 6379 → host | 17.5d uptime, 2MB used, no maxmemory limit, RDB persistence (AOF off). `redis-cli ping` → PONG. |
| Redis channels | `squad/agent/{elmo,bert,ernie,grover}`, `squad/events`, `squad/interrupt` | active | `jirito/events` not yet created — bridge will create it. |
| jirito server | Node 22 + sql.js | `:3001` (existing) | REST API complete, 9 routes. Will gain `webhooks.ts`, `routes/columns.ts`, `prUrl` column. |
| m5 NUC | Linux 6.12, Debian 13 | `127.0.0.1` | Kyle has `sudo NOPASSWD`. |
| User systemd | `State: degraded` (5 failed units — `paperclip`, `responses-proxy` likely from past kill events) | `~/.config/systemd/user/` | Bridge unit goes here. `loginctl enable-linger kyle` for boot-time start. |
| Squad agents | All 4 RUNNING | tmux sessions `squad-{elmo,bert,ernie,grover}` | CLI dispatch path: `squad-dispatch-redis.py`. |
| Squad agent roles | Elmo=Coder, Bert=Arch/Specs, Ernie=Research, Grover=Creative | `~/.hermes/profiles/*/SOUL.md` | Evo triages by content keywords (Spec Topic 6). |

## Pre-work before implementation starts

1. **Kyle creates the "Blocked" custom column in jirito UI.** Capital B, no extra whitespace. Note its id (or look it up via `GET /api/columns?name=Blocked` after Phase 1 lands).
2. **Verify `loginctl enable-linger kyle`** is set (one-time). If not, run it. Required for the bridge unit to survive logout/reboot.
3. **Verify the squad agents' Python venvs have `redis` available.** Test: `~/.hermes/profiles/elmo/venv/bin/python -c "import redis"`. If missing, install it before Phase 6 (the new plugin needs it).
4. **Verify Node 22 is the system default.** `node --version` should print `v22.x`. If not, agents and bridge will run on the wrong Node.

## Build order (copy this to a TODO list)

1. **Phase 1** — Schema, Outbox, Columns route. ~45 min. **Elmo.**
2. **Phase 2** — Webhook Emitter. ~1 hour. **Elmo.** Depends on Phase 1.
3. **Phase 3** — Webhook Bridge + systemd unit. ~1 hour. **Elmo.** Depends on Phase 2.
4. **Phase 4** — Outbox Drainer cron. ~30 min. **Elmo.** Depends on Phase 1.
5. **Phase 5** — Jirito CLI. ~30 min. **Elmo.** Depends on Phase 1 + Blocked column (Kyle).
6. **Phase 6** — Evo wake injector plugin. ~1 hour. **Elmo.** Depends on Phase 3.
7. **Phase 7** — Squad agent protocol skill. ~30 min. **Bert** (writing docs). Depends on Phase 5.
8. **Phase 8** — Review flow skill (Evo side). ~30 min. **Evo** (writing her own skill, but I can do it).
9. **Phase 9** — End-to-end test. ~1 hour. **Evo** runs it, Kyle + Elmo + Bert on standby.

Phases 1-5 are sequential (one agent at a time, Elmo). Phases 6-8 can run in parallel after Phase 5. Phase 9 is final.

## First thing to do in a fresh session

```bash
# 1. Confirm we're on m5 and the right working directory
hostname && pwd

# 2. Read the docs
cat ~/Development/jirito/docs/JIRITO_SQUAD_HANDOFF.md   # this file
cat ~/Development/jirito/docs/JIRITO_SQUAD_SPEC.md
cat ~/Development/jirito/docs/JIRITO_SQUAD_IMPLEMENTATION_PLAN.md

# 3. Verify infra still up
redis-cli ping
ps -ef | grep -E "tsx server/index.ts" | grep -v grep
tmux ls | grep squad-

# 4. Ask Kyle "go?" — he must say go before any code is written
```

## Critical reminders

- **DO NOT** add a `blocked` status to jirito's schema. Use the custom column. (Decision #2.)
- **DO NOT** auto-promote `review` → `done` on pass. Stay at review. (Decision #3.)
- **DO NOT** use `nohup` for the bridge. User systemd. (Decision #6.)
- **DO NOT** use type-based routing. Assignee-or-triage only. (Decision #1.)
- **DO NOT** use Discord for squad-to-squad handoff. Use Redis pub/sub and jirito.
- **DO NOT** add authentication. Localhost-only, Kyle's box is his box.
- **DO** follow the dispatch shape from the squad-v2 skill: file-first body, not inline. Avoid the 900s timeout trap.
- **DO** verify each phase's checklist before moving to the next. If a phase fails verification, do not dispatch the next.
- **DO** update this handoff doc when the build completes (mark phases done, note surprises).

## What to watch for

| Symptom | Likely cause | Fix |
|---|---|---|
| Bridge returns 503 | Redis not reachable from bridge process | `redis-cli ping` from bridge's context; check Docker |
| Plugin loads but never injects | `event_id` dedup cache hit (replay) | Check wiretap log; clear cache if stale |
| Agent's `jirito show 107` hangs | jirito server down | `ps -ef | grep tsx`; restart `npm run dev` |
| Drainer cron exits 1 every minute | Bridge down OR outbox rows stuck in retry | Check bridge health + outbox table state |
| `ticket.review` fires but Evo doesn't review | Plugin failed to inject OR injected to wrong channel | Check wiretap, check default profile's `agent.log` for the wake |
| Phase 9 E2E stalls at any transition | Likely webhook chain broken — start from outbox, trace forward | `sqlite3 jirito.db "SELECT * FROM webhook_outbox ORDER BY id DESC LIMIT 10"` |

## Open items (not blocking the build, but flag for v2)

- Backup of `jirito.db` (sql.js is in-memory + disk save, no WAL — risk of data loss on crash). **Out of scope v1.**
- Replay API for the outbox (manual SQL works fine in v1).
- Dead-letter UI in jirito (`jirito outbox` CLI is enough for v1).
- Multi-reviewer support (Evo is the only reviewer; could add a second LLM pass).
- Bidirectional comment wakes (Kyle's comments don't wake agents — agents poll on their own next action).
- PR auto-merge after Kyle's sign-off.
- Bidirectional sync if Kyle edits a ticket the agent is currently working on (last-write-wins; no conflict resolution).

## Anti-patterns (don't do)

- **Don't add webhook signing or HMAC.** Localhost only. Signing is ceremony for zero security gain on a trusted box.
- **Don't use `Express` or `fastify` for the bridge.** Plain `node:http` is 100 lines. No new deps beyond `redis`.
- **Don't add a real database to the bridge.** Pub/sub is fire-and-forget. The outbox in jirito is the source of truth.
- **Don't write TypeScript for the CLI.** Python stdlib is faster to write, faster to run, no build step, and matches the bash-y style agents use.
- **Don't put the jirito-evolved skills in jirito's repo.** They go in `~/.hermes/skills/` because they're for the squad, not for jirito. The CLI goes in jirito's repo (it's a client of the API).
- **Don't dispatch a phase that depends on a previous phase's verification.** The checklist exists for a reason.
- **Don't use `squad-dispatch.sh`.** Deprecated. Use `squad-dispatch-redis.py` per the squad-v2 skill.
- **Don't ask Kyle to wake you when a squad task completes.** The wake hook does that. The system wakes Evo.
- **Don't add features not in the spec.** The spec was the result of 3 rounds of design discussion. If you think something is missing, ask Kyle before adding it.

## When you're done with the build

1. Mark all 9 phases done in this handoff (replace the build-order checklist with `[x]`).
2. Run Phase 9 (E2E test) and capture the result.
3. Update the squad agent SOUL.md files if any new conventions emerged (probably not — the protocol skill should be self-contained).
4. Save a memory entry: `jirito integration is live; webhook bridge is at :3030 user systemd; plugin in ~/.hermes/plugins/jirito-event-injector`. (Memory-vault pattern.)
5. Save a skill: `jirito-squad-protocol` is already in `~/.hermes/skills/`, but if you find new pitfalls during the build, patch the skill.
6. Tell Kyle: "Built and tested. Next ticket you file will flow through the squad."

## Questions?

If anything in the spec/plan is unclear, the order of operations is: read the relevant topic in `JIRITO_SQUAD_SPEC.md`, check the phase in `JIRITO_SQUAD_IMPLEMENTATION_PLAN.md`, look at the related existing code in `~/Development/jirito/`, ask Kyle.
