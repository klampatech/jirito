# Squad tmux → herdr migration spec

**Status:** Approved in principle, pending two open questions below.
**Author:** Evo
**Date:** 2026-06-21 (decision day)

## Goal

Replace the tmux-based squad lifecycle supervisor with herdr. Same persistent-session guarantee, agent-aware state, programmatic control surface via Unix socket.

## Why herdr (the honest case)

| Capability | Today (tmux) | With herdr |
|---|---|---|
| Always-on per-agent CLI session | ✓ (`tmux new-session -d`) | ✓ (`herdr session attach`) |
| Inspectable via attach | ✓ (`tmux attach -t squad-<name>`) | ✓ (`herdr session attach squad-<name>`) |
| Programmatic send/capture | ✓ (`send-keys` / `capture-pane`) | ✓ (`pane.send_text` / `pane.read`) |
| Agent state awareness | Heuristic (regex against wiretap + logs) | Native (sidebar reports blocked/working/done/idle) |
| Wait for state event | Poll the wiretap, hope | `herdr wait agent-status --status done` |
| Cross-host attach from anywhere | Only via SSH into m5 | `herdr --remote <name>` |
| One pane of glass for Kyle's own work + squad | No | Yes |

The genuine wins are (1) the agent-state primitive — replaces our Redis wiretap + stall-watchdog heuristic layer with first-class events, and (2) `herdr wait agent-status` which collapses the stall-detection polling.

## Scope — what stays vs what changes

**Stays (vast majority):**

- `squad-dispatch-redis.py` — task publishing to `squad/agent/<name>` Redis channels. No tmux coupling except one subprocess call inside `_cold_restart_agent()`.
- `squad-agent-inbox` plugin + systemd services — write inbound tasks to JSONL.
- `squad-inbox-gateway` plugin — poll JSONL, inject via `ctx.inject_message()`.
- `squad-relay` plugin — wiretap + Discord mirror + Evo `pre_llm_call` injection.
- `redis-event-bus.py` — event publishing.
- The 4 agent profiles + SOUL.md + config.yaml + .env — unchanged.
- `squad-dispatch.sh` (legacy SSH dispatch) — does not touch tmux primitives, just SSHes and execs the agent's hermes CLI. No change needed.
- `squad-stall-watchdog.py` and the wiretap-vs-reality triangulation — unchanged for the migration. (Optional Phase 2 simplification: replace with `herdr wait agent-status` subscriptions — separate spec.)

**Changes (precise list):**

1. **`~/.hermes/scripts/squad-clis.sh`** — full rewrite. Every `tmux *` call becomes a `herdr *` call. Same CLI surface (`start|stop|restart|status|attach|logs`). New file is ~140 lines, same shape.
2. **`_cold_restart_agent()` in `~/.hermes/scripts/squad-dispatch-redis.py`** — single line: `subprocess.run([script, "restart", agent], ...)` becomes `subprocess.run([NEW_SCRIPT, "restart", agent], ...)` (point at the new herdr-based script). The log-poll for `[squad-inbox] Registered and started` is **unchanged** — `tee` in the pane command writes the same file at the same path.
3. **herdr server must be running on m5** before any `squad-herdr.sh` invocation. Bootstrap: `nohup herdr server > ~/.hermes/logs/herdr-server.log 2>&1 &` or via a systemd user unit.

**Naming question (open):** keep the script name `squad-clis.sh` or rename to `squad-herdr.sh`? My recommendation: keep `squad-clis.sh`. The CLI mode vs gateway mode distinction is what the script enforces; the supervisor backend is an implementation detail. Every other reference (skills, audit logs, muscle memory) doesn't need to change.

## Command mapping (the meat)

| Current (tmux) | herdr equivalent | Notes |
|---|---|---|
| `tmux has-session -t squad-<name>` | `herdr session list --json \| jq -e '.[] \| select(.name=="squad-<name>")'` | No native "exists?" — list + filter |
| `tmux new-session -d -s squad-<name> -x 220 -y 50 "HERMES_PROFILE=<name> ${HERMES_BIN} --profile <name> --yolo 2>&1 \| tee <log>"` | `herdr session attach squad-<name> || herdr workspace create --cwd ~ --label squad-<name> && herdr pane run <pane_id> "HERMES_PROFILE=<name> ${HERMES_BIN} --profile <name> --yolo 2>&1 \| tee <log>"` | herdr doesn't have a single-shot "new session with command" CLI verb. Need to ensure-attached-then-create-workspace-then-run-in-pane. |
| `tmux send-keys -t squad-<name> C-c` then sleep 2 then `tmux kill-session -t squad-<name>` | `herdr pane send-keys <pane_id> C-c` then sleep 2 then `herdr pane close <pane_id>` (or `herdr session stop squad-<name>` for full stop) | Sending Ctrl-C to the running process then closing the pane. Note: `session stop` is the nuclear option — closes every pane in that session. |
| `tmux list-panes -t squad-<name> -F "#{pane_pid}"` | `herdr pane process-info <pane_id>` (returns JSON with PID) | For status output |
| `tmux attach -t squad-<name>` | `herdr session attach squad-<name>` | Direct mapping |
| `tail -f ~/.hermes/logs/squad-cli-<name>.log` | Unchanged | The pane command still pipes through `tee`, same log path, same content |

**Critical observation: the `tee` in the pane command is the load-bearing piece for log access.** If you skip the `tee` and rely on `herdr pane read`, the log files go away and the cold-restart readiness check breaks. Keep the `tee`. herdr pane is still a real PTY.

**Alternative for capture:** `herdr pane read <pane_id> --source recent --lines 2000` returns the recent output buffer. This is more reliable than parsing `tmux capture-pane` (which can have escape-sequence artifacts). If we ever replace the `tee` log with `herdr pane read` (Phase 2), we get a real upgrade.

## Per-file changes

### 1. `~/.hermes/scripts/squad-clis.sh` — full rewrite

New shell, ~140 lines. Same CLI surface. Key sections:

```bash
# is_running() — list sessions, check name
is_running() {
    herdr session list --json 2>/dev/null | jq -e --arg n "squad-$1" \
        '.[] | select(.name == $n)' >/dev/null
}

# start_one() — attach-or-create the session, create a workspace, run the agent in a pane
start_one() {
    local name="$1"
    if is_running "$name"; then
        echo "  $name: already running"
        return 0
    fi
    herdr session attach "squad-${name}" 2>/dev/null &
    sleep 0.5
    local pane_id
    pane_id=$(herdr workspace create --cwd ~ --label "squad-${name}" --no-focus --json \
              | jq -r '.root_pane')
    herdr pane run "$pane_id" \
        "HERMES_PROFILE=${name} ${HERMES_BIN} --profile ${name} --yolo 2>&1 | tee $(log_path "$name")"
    sleep 1
    if is_running "$name"; then
        echo "  $name: started"
    else
        echo "  $name: FAILED — check $(log_path "$name")"
        return 1
    fi
}

# stop_one() — Ctrl-C the pane, then close it
stop_one() {
    local name="$1"
    local pane_id
    pane_id=$(herdr pane list --json 2>/dev/null | jq -r --arg s "squad-${name}" \
              '.. | .pane_id? // empty' | head -1)   # ⚠ need to resolve pane→session correctly
    [[ -n "$pane_id" ]] && herdr pane send-keys "$pane_id" C-c
    sleep 2
    herdr session stop "squad-${name}"
    echo "  $name: stopped"
}

# status_one() — list panes, get PID + uptime
# (similar to current, just different source)
```

**Pitfall to nail down before writing:** how to resolve "session name → pane id" reliably. The `pane list` output needs to be filtered by session. Verify against actual `herdr pane list --json` output shape during pilot.

### 2. `~/.hermes/scripts/squad-dispatch-redis.py` — one-line change

```python
# OLD (line ~388):
script = os.path.expanduser("~/.hermes/scripts/squad-clis.sh")

# NEW (if we keep the same filename, no change needed):
script = os.path.expanduser("~/.hermes/scripts/squad-clis.sh")
# ↑ if we keep the filename, the only change is what's INSIDE squad-clis.sh.
```

If we rename the script, this line changes. **Recommendation: keep the filename.** Zero change to `squad-dispatch-redis.py`.

### 3. herdr server bootstrap (new)

Add a one-time bootstrap: ensure the herdr server is running on m5 before any squad-herdr.sh invocation. Two options:

**Option A — implicit:** `squad-clis.sh start` checks `herdr status` first and starts the server if not running. Pro: callers don't need to know. Con: extra latency on every start.

**Option B — explicit systemd unit:** `~/.config/systemd/user/herdr-server.service`. Pro: standard pattern, survives reboots. Con: more moving parts.

**Recommendation:** Option B. One unit, autostart on user login, log to `~/.hermes/logs/herdr-server.log`.

```
[Unit]
Description=herdr session server (squad supervisor)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/herdr server
Restart=always
RestartSec=5
StandardOutput=append:%h/.hermes/logs/herdr-server.log
StandardError=append:%h/.hermes/logs/herdr-server.log

[Install]
WantedBy=default.target
```

## Pilot plan — Grove, 1 week

**Why Grove first:** the most isolated of the four — research/creative work, not on the critical path for spec/impl cycles. If Grove wedges for a day, nothing downstream blocks.

**Phase 0 — prerequisites (Kyle, before pilot):**
- [ ] Confirm the existing herdr server Kyle has running is on **m5** (autogpt.local). If it's elsewhere, we have a cross-host architecture to plan separately.
- [ ] Install herdr on m5 if not present: `brew install herdr` (or whatever the package manager is).
- [ ] Start herdr server as a systemd user service on m5 (Option B above).
- [ ] Verify: `herdr status server` from an m5 shell returns healthy.

**Phase 1 — pilot (week 1):**
- [ ] Rewrite `squad-clis.sh` per the new shape above. Keep `tmux` as a fallback internal path during pilot if cheap — but probably not worth the complexity; commit to herdr.
- [ ] Stop the existing tmux-managed Grove session (`squad-clis.sh stop grover` on the old script, OR `tmux kill-session -t squad-grover` directly).
- [ ] Start Grove under the new script: `./squad-clis.sh start` (others stay on tmux for now — yes, mixed mode is intentional during pilot).
- [ ] Verify Grove comes back online: `squad-clis.sh status grover` shows RUNNING; `~/.hermes/logs/squad-cli-grover.log` shows `[squad-inbox] Registered and started`.
- [ ] Dispatch a real task to Grove via `squad-dispatch-redis.py grover "..."` and verify end-to-end completion.
- [ ] Verify the cold-restart path: dispatch with `--cold-start`, watch `_cold_restart_agent()` complete cleanly.
- [ ] Verify the attach path: from Kyle's machine, `herdr --remote m5` (or whatever ssh-config alias) attaches and shows Grove's pane in the sidebar.

**Phase 2 — daily check (days 2-7):**
- [ ] Run `squad-clis.sh status` daily, log uptime.
- [ ] Compare against tmux-managed baseline (Elmo/Bert/Ernie uptimes are the control).
- [ ] Watch for: herdr server crashes, session auto-recovery behavior, agent-state-event accuracy vs the wiretap.
- [ ] On any wedge: rollback per "Rollback" below. Document the failure mode.

**Phase 3 — pilot review (day 7):**
- [ ] Decide: ship to all 4 agents, or rollback + rework.
- [ ] Decision criteria in "Success criteria" below.

## Success criteria

For pilot to graduate, ALL of:

1. **7 days uptime** for Grove under herdr supervision. ≥99% uptime (≤24h total downtime over 7 days is acceptable; longer wedges = fail).
2. **No new failure modes** introduced. Specifically: herdr server crash recovery ≤30s; herdr update doesn't lose live panes; agent-state events match wiretap reality within 5s.
3. **Cold-restart path works.** `_cold_restart_agent()` returns within 30s and the next task dispatches cleanly.
4. **Log path is unchanged.** `~/.hermes/logs/squad-cli-grover.log` keeps growing with the same content shape (so the cold-restart readiness marker still works).
5. **Attach from Kyle's machine works.** `herdr --remote <m5 alias>` shows Grove's pane in the sidebar.

## Rollback

**Mid-pilot:** if Grove wedges or herdr behaves badly:
1. `herdr session stop squad-grover` — stops the herdr-managed session.
2. Manually restart Grove under tmux: `tmux new-session -d -s squad-grover ...` (the exact command from the OLD `squad-clis.sh start_one`).
3. Pilot failed. File an issue, revise the script, try again next week. The other 3 agents never moved off tmux, so the production chain is unaffected.

**After all-4 migration:** if a herdr regression breaks the squad chain:
1. `herdr session stop` for all 4 squad sessions.
2. Revert `squad-clis.sh` to the prior tmux version (git or backup).
3. `squad-clis.sh start` brings all 4 back under tmux.
4. The dispatch path (`squad-dispatch-redis.py`) was never modified, so cold-restart calls immediately work against the old script.

**Worst case (herdr server wedged, can't stop cleanly):** `pkill -9 -f 'herdr server'` to nuke the server, then proceed with rollback above. Panes are killed with the server; the next tmux start creates fresh processes.

## Migration sequence (after pilot success)

| Step | Action | Risk | Rollback |
|---|---|---|---|
| 1 | Pilot Grove on herdr (1 week) | Low — isolated agent | Restore tmux session manually |
| 2 | Move Elmo to herdr | Medium — codex harness, on the build path | `squad-clis.sh stop` + revert script + `tmux new-session` |
| 3 | Move Bert to herdr | Medium — planning, spec generator | Same |
| 4 | Move Ernie to herdr | Low — research only | Same |
| 5 | All 4 on herdr, mark tmux supervisor as legacy | — | Revert script (git) |
| 6 | **Phase 2: install herdr integrations + collapse stall-watchdog.** Install `hermes` integration on all profiles, `claude` on Bert/Grover, `codex` on Elmo. Rewrite `squad-stall-watchdog.py` to subscribe to `herdr wait agent-status` events instead of polling the wiretap. | New scope, bundled | Per-integration uninstall, watchdog revert (git) |

Each agent migration is a 1-line edit to `~/.hermes/scripts/squad-clis.sh`'s `AGENTS=(...)` array (or whatever controls which agents the script manages). The shape of the script doesn't change between agents.

## Decisions (2026-06-21)

| # | Question | Decision |
|---|---|---|
| 1 | Is herdr server on m5? | **Yes** (verified v0.7.0, server running, socket at `~/.config/herdr/herdr.sock`). Phase 0 prerequisite done. |
| 2 | Rename `squad-clis.sh`? | **No** — keep filename. Zero changes to `squad-dispatch-redis.py` needed. |
| 3 | Retire `squad-dispatch.sh` (legacy SSH)? | **Yes** — bundle into the migration. |
| 4 | Bundle Phase 2 (wiretap + stall-watchdog collapse into herdr state events)? | **Yes** — bundle. Caveat: Ernie has no herdr integration (no coding harness), so see "Ernie exception" below. |
| 5 | herdr update cadence? | **Manual review**. No auto-update. |

## Two new open questions surfaced during decision review

### Q-A: OCR `--review` flag is only in `squad-dispatch.sh`

The post-dispatch OCR review (`squad-dispatch.sh --review [base] <agent> "<task>"`) is implemented **only in the SSH dispatch path**, not in `squad-dispatch-redis.py`. It's referenced in 4+ skills:

- `~/.hermes/skills/software-development/software-craft/open-code-review/SKILL.md`
- `~/.hermes/skills/software-development/software-craft/open-code-review/references/ocr-integration-squad-dispatch.md`
- `~/.hermes/skills/autonomous-ai-agents/coding-harnesses/references/open-code-review.md`
- `~/.hermes/skills/ai-agents/squad-v2/SKILL.md`

If we retire `squad-dispatch.sh` without porting `--review`, OCR review silently disappears from the workflow.

**Three options:**

1. **Port `--review` to `squad-dispatch-redis.py`** before retiring `squad-dispatch.sh`. Adds ~80 lines (the `inject_completion()` review path + the `dispatch_agent()` review flag) plus the skill doc updates. Real work but clean.
2. **Keep `squad-dispatch.sh` alive as a one-flag tool** (just the `--review` path, no full dispatch). Strips out `dispatch_agent()` and friends, keeps only the review path. Minimal but adds a second script to maintain.
3. **Retire `squad-dispatch.sh` and drop OCR review.** Accept the loss. Probably not what Kyle wants — OCR has caught real bugs.

**My recommendation: option 1.** The review path is real and useful; porting it into the Redis dispatch path makes the canonical tool feature-complete.

## Q-B: Resolved — Hermes Agent integration gives all 4 agents semantic state

**You were right that Ernie is the same runtime as the others** — all four run Hermes CLI. I was reading stale v0.5.x docs and missed that herdr v0.7.0 ships a Hermes Agent integration:

```bash
herdr integration install hermes
```

From the v0.7.0 integrations doc, Hermes is in the **"lifecycle authority"** category (alongside Pi, OMP, Kimi, OpenCode, Kilo):

> Hook/plugin events author `idle`, `working`, and `blocked`. Herdr does NOT use screen manifest fallback for that lifecycle authority.

Plus **native session restore** is supported (Hermes integration version `2` required). This means:

- All 4 agents get **semantic state events** (working/blocked/done/idle) from the Hermes CLI's own hooks — no process-name heuristics.
- All 4 agents get **native session restore** across herdr server restarts.
- The wiretap-vs-reality triangulation becomes **unnecessary** — state source is the CLI's own hooks, the same source as the actual work. Single source of truth.
- The squad-stall-watchdog becomes a thin event subscriber against `herdr wait agent-status`, not a hybrid subscriber-with-wiretap-fallback.

**Required installations (per profile, run once):**
```bash
herdr integration install hermes       # for Ernie + Evo (Hermes CLI only)
herdr integration install claude      # for Bert + Grover (Claude Code)
herdr integration install codex       # for Elmo (Codex)
```

These install hooks + update each CLI's config. Install order: hermes first (covers the most agents), then claude/codex for the harness-using ones.

**Verification before pilot: confirm the hermes integration writes hooks into `~/.hermes/hooks/` (or wherever) without conflicting with our existing squad plugins** (`squad-agent-inbox`, `squad-inbox-gateway`, `squad-relay`). Plan: `herdr integration install hermes --dry-run` or read the install source after a single-profile test on Grove.

**Decision:** full bundle as originally specified — no Ernie exception. Phase 2 collapse applies to all 4 agents.

## Phase 0 prerequisite status (2026-06-21)

- [x] **herdr installed on m5** — v0.7.0 at `/home/kyle/.local/bin/herdr`
- [x] **herdr server running** — confirmed via `herdr status server` (status: running, socket ready)
- [x] **Q-A decided** — port `--review` to `squad-dispatch-redis.py` before retiring `squad-dispatch.sh`
- [x] **Q-B decided** — full bundle, no Ernie exception (hermes integration covers all 4 agents)
- [ ] **Verify hermes integration install path doesn't conflict with squad plugins** — pre-pilot check on Grove
- [ ] **systemd user unit for herdr server** — recommended for boot persistence, not blocking the pilot

## Files this spec touches

- `~/.hermes/scripts/squad-clis.sh` — full rewrite (~140 lines, same CLI surface)
- `~/.hermes/skills/herdr/SKILL.md` — created (v1.0.0)
- `~/.hermes/skills/squad/SKILL.md` — minor edit: update the "Connecting" section to reference herdr instead of tmux, but keep the squad-clis.sh CLI surface reference unchanged
- `~/.config/systemd/user/herdr-server.service` — new unit file
- `~/.hermes/logs/herdr-server.log` — new log (managed by systemd)

## Files this spec does NOT touch

- `squad-dispatch-redis.py` — zero changes
- `squad-dispatch.sh` (legacy SSH) — zero changes
- `squad-relay`, `squad-agent-inbox`, `squad-inbox-gateway` plugins — zero changes
- Any agent's `config.yaml`, `.env`, or `SOUL.md` — zero changes
- The Redis layer — zero changes

This is a narrow migration. The dispatch chain (Redis pub/sub → inbox daemon → JSONL → gateway plugin → CLI session) is supervisor-agnostic. We're swapping the supervisor.