# Jirito × Squad — E2E Test Results (2026-06-16)

> Phase 9 of the integration. First end-to-end run. Real code, real PR, real Discord thread.

## Outcome: PASS (after wake-delivery fix)

| Step | Status | Notes |
|---|---|---|
| 1. Create ticket | ✅ | Outbox → bridge → plugin — all delivered |
| 2. Plugin receives event | ✅ | Wiretap `received` |
| 3. Plugin ticket-exists guard | ✅ | Real tickets pass, fake IDs blocked |
| 4. Triage | ✅ | Routed to Elmo per routing rules |
| 5. Dispatch Elmo (squad-dispatch-redis.py) | ✅ | Chain: Redis → elmo.jsonl → squad-inbox-gateway poller → `ctx.inject_message` (verified post-fix) |
| 6. Elmo works the ticket | ✅ | Code change, build, tests, commit, push, PR, prUrl, move-to-review |
| 7. PR review (Evo) | ✅ | Reviewed commit 44d1753 — clean 10-line change, all checks pass |
| 8. Verdict comment | ✅ | "Review verdict: PASS" posted |
| 9. Sign-off to #operations | ✅ | 🟢 posted |
| 10. Kyle moves to done | ⏳ | Pending (your move) |
| 11. Jirito wake to Evo (default profile) | ✅ (mechanism verified) | Plugin writes to `~/.hermes/inbox/default.jsonl`; squad-inbox-gateway picks it up. Verified by test ticket #113 — but my CURRENT session doesn't have the plugin loaded (started before the config change). Needs session restart to deliver the wake to a live session. |

## Ticket

- **#112**: "E2E: Add ?search= filter to GET /api/issues"
- **Branch**: `feat/squad-integration`
- **PR**: https://github.com/klampatech/jirito/pull/21
- **Commit**: `44d1753` (10 lines added, 1 deleted, 1 file)
- **Receipt**: `~/squad-output/jirito-integration/phase-9/elmo.json`

## What was wrong (and what I got wrong)

I initially reported two large bugs:
1. "The wake injection is broken for **everyone**" — including squad agents
2. "The plugin calls the wrong API name" — a code-level bug

**Both were wrong.** Kyle pushed back (correctly), and digging in showed:

### The real bug: config, not code

`~/.hermes/config.yaml` had:
```yaml
plugins:
  disabled:
    - squad-inbox-gateway   # <-- this line
  enabled:
    - squad-relay
    - squad-agent-inbox
    - jirito-event-injector
    # ... (no squad-inbox-gateway)
```

The `squad-inbox-gateway` plugin (the consumer that polls `~/.hermes/inbox/<agent>.jsonl` and calls `ctx.inject_message()`) was **globally disabled**. The squad agent profiles (`elmo`, `bert`, `ernie`, `grover`) each tried to re-enable it in their profile configs, but the global disable won.

Result: `squad-dispatch-redis.py` published to Redis → `squad-agent-inbox` wrote to JSONL → **no consumer read the JSONL** → task silently died.

**Why I missed it:** I checked that the JSONL file was being written (✅) and concluded "the wake is broken" instead of checking whether the consumer was loaded. `grep -c "squad-inbox" ~/.hermes/logs/squad-cli-elmo.log` returned 0 because the plugin never ran — but I didn't run that check before declaring the system broken.

**Why was it disabled?** Unknown. Probably a leftover from the 2026-06-02 gateway-to-CLI pivot or the 2026-06-03/05 squad-inbox-gateway churn. There's no doc explaining it. Fixed by moving it from `disabled` to `enabled` in the global config.

### The OTHER bug (real, but smaller): wrong API name

The jirito plugin called `ctx.inject_synthetic_event()` which doesn't exist. The real API is `ctx.inject_message()`. Even with the right name, `_ctx` is `None` in standalone mode (the plugin runs as a separate daemon, not loaded into the gateway/CLI process).

**Fix:** v0.3.0 adds a dual-path delivery:
1. `ctx.inject_message()` if ctx is available (would work if loaded into the CLI process)
2. JSONL inbox fallback to `~/.hermes/inbox/default.jsonl` otherwise

The fallback uses the same producer/consumer split as `squad-agent-inbox` → `squad-inbox-gateway`. The squad-inbox-gateway is now enabled in the default profile too, so the wake reaches Evo via the same proven path.

## Why the gateways were abandoned (confirmed)

Per `mem/infra/squad-cli-mode-tmux.md`:

- `hermes gateway run` is a thin message router. It never instantiates `HermesCLI`, so `PluginContext._cli_ref` stays `None` forever.
- `ctx.inject_message()` immediately returns `False` in gateway mode (`hermes_cli/plugins.py:362-376`).
- 0 successful injects across all 4 agents between plugin install (May 29) and the diagnosis (June 2).
- The squad **appeared** to work because agents follow skill instructions regardless of how the task arrived — but the dispatch chain was a complete facade.
- Pivot on 2026-06-02: `squad-clis.sh` runs `hermes --profile <name> --yolo` (CLI mode). CLI mode sets `_cli_ref` in `HermesCLI.__init__`, so `inject_message()` works.

## What I changed

### Code (`~/.hermes/plugins/jirito-event-injector/`)
- **plugin.py v0.3.0**: Added `InboxFile` class (mirrors squad-agent-inbox). Rewrote inject block to try `ctx.inject_message()` first, fall back to `InboxFile.write_event()` on None/failure. Bumped version, updated docstring.
- **plugin.yaml v0.3.0**: Added `inbox_fallback_path` config (default `~/.hermes/inbox/default.jsonl`). Updated description.

### Config (`~/.hermes/config.yaml`)
- Moved `squad-inbox-gateway` from `plugins.disabled` to `plugins.enabled`. Now loads in all 5 profiles (elmo, bert, ernie, grover, default).

### Service restarts
- `squad-clis.sh restart` — all 4 squad CLIs reloaded with the now-enabled plugin. Verified in `agent.log`: `[squad-inbox] Gateway polling started (agent=<name>, interval=5s, ...)`.
- Killed the old jirito-event-injector daemon (was running with `HERMES_PROFILE=elmo`, wrong context). Started a fresh one without `HERMES_PROFILE` set.

## Verification

| What | How | Result |
|---|---|---|
| Squad-inbox-gateway loads in all 4 agents | `grep "Gateway polling started" ~/.hermes/profiles/<name>/logs/agent.log` | ✅ all 4 |
| Jirito plugin writes to default.jsonl on real event | Created ticket #113, checked default.jsonl | ✅ entry present, format correct |
| Ticket-exists guard still works | Published fake event with id=999 | ✅ `skipped_unknown_ticket` in wiretap |
| Squad dispatch chain (Redis → agent) | `squad-dispatch-redis.py elmo` with sentinel prompt | ✅ `[squad-inbox] Injected task ... (1472 chars) via inject_message` in elmo's agent.log; Elmo's tmux shows `synthesizing...` |

## What's pending

- **Evo's current session doesn't have `squad-inbox-gateway` loaded** — it was disabled when this session started. When you end this session and start a new one (e.g., via Discord `/new` or by closing and reopening the channel), the plugin will be loaded, and any pending jirito wake events in `default.jsonl` will be delivered. Test by creating a new ticket in the dashboard.
- **tmux send-keys gotcha** (carried over from before): Ctrl+C twice kills a squad session. Use the tmux-paste-buffer pattern (`tmux load-buffer` + `tmux paste-buffer` + `tmux send-keys Enter`) for manual wake injection if you ever need to bypass the queue again.
- **908 commits behind** warning on the squad CLIs (probably related to the 0.16.0 hermes update from June 5). Out of scope for this fix; worth scheduling a squad restart on a fresh hermes version.

## What Kyle can do now

1. **End this session and start a new one** to load the now-enabled plugin in the default profile CLI.
2. **In the new session, create a test ticket** via the dashboard (`http://100.95.111.112:3001`). The jirito plugin will fire, write to `default.jsonl`, the squad-inbox-gateway will poll and inject the wake, the jirito-review skill will auto-load, and I'll triage it.
3. **For real usage** — same flow, no more manual wake injection needed.

## Verification checklist (from plan §9)

- [x] End-to-end test passes: ticket moves from `backlog` → `inprogress` → `review`
- [x] #operations shows the sign-off line: `🟢 JIRITO-112 ready for sign-off — …`
- [ ] jirito UI shows the ticket in the `Done` column (Kyle's manual move pending)
- [x] Outbox is empty (all events delivered) — verified at end
- [x] No errors in any logs (other than the expected `inject_failed` for the broken wake, which is now fixed)
- [x] Squad dispatch chain works (post-fix verification with sentinel task)
- [x] Jirito plugin dual-path delivery works (post-fix verification with test ticket #113)

## Related

- Plan: `docs/JIRITO_SQUAD_IMPLEMENTATION_PLAN.md`
- Spec: `docs/JIRITO_SQUAD_SPEC.md`
- Squad CLI mode rationale: `~/Obsidian/mem/infra/squad-cli-mode-tmux.md`
- Plugin source: `~/.hermes/plugins/jirito-event-injector/plugin.py` (v0.3.0)
- Wiretap log: `~/.hermes/logs/jirito-event-injector-wiretap.log`
- Elmo's receipt: `~/squad-output/jirito-integration/phase-9/elmo.json`
