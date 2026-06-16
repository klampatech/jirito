# Jirito × Squad — E2E Test Results (2026-06-16)

> Phase 9 of the integration. First end-to-end run. Real code, real PR, real Discord thread.

## Outcome: PASS (with workarounds)

| Step | Status | Notes |
|---|---|---|
| 1. Create ticket | ✅ | Outbox → bridge → plugin — all delivered |
| 2. Wake fires (plugin side) | ✅ | Wiretap logged `received` |
| 2b. Wake reaches Evo | ❌ | `inject_synthetic_event` — wrong API, no ctx, standalone mode |
| 3. Triage | ✅ | Routed to Elmo per routing rules |
| 4. Dispatch Elmo (via Redis) | ⚠️ | Dispatched but never reached Elmo (same wake bug) |
| 4b. Manual injection | ✅ | Used `tmux load-buffer` + `paste-buffer` + Enter (see Pitfalls) |
| 5. Elmo works the ticket | ✅ | Code change, build, tests, commit, push, PR, prUrl, move-to-review |
| 6. PR review (Evo) | ✅ | Reviewed commit 44d1753 — clean 10-line change, all checks pass |
| 7. Verdict comment | ✅ | "Review verdict: PASS" posted to ticket |
| 8. Sign-off to #operations | ✅ | 🟢 posted |
| 9. Kyle moves to done | ⏳ | Pending |

## Ticket

- **#112**: "E2E: Add ?search= filter to GET /api/issues"
- **Branch**: `feat/squad-integration`
- **PR**: https://github.com/klampatech/jirito/pull/21
- **Commit**: `44d1753` (10 lines added, 1 deleted, 1 file)
- **Receipt**: `~/squad-output/jirito-integration/phase-9/elmo.json`

## Findings (real bugs surfaced by the E2E)

### 🔴 Finding 1 — Wake injection is broken for **everyone**

**Symptom**: Plugin's wiretap shows `received` → `inject_failed` with `inject_error: 'NoneType' object has no attribute 'inject_synthetic_event'`.

**Root cause** (two layers):
1. The jirito plugin calls `ctx.inject_synthetic_event()` — that method does not exist. The real API is `ctx.inject_message()` (see `hermes_cli/plugins.py:362`).
2. Even with the right name, `ctx` would be `None` because the plugin runs in **standalone mode** (`kind: standalone` in `plugin.yaml`). In standalone mode, no host process calls `register(ctx)`, so `_ctx` is never set.

**Same bug applies to squad agents**:
- `squad-agent-inbox` is also `kind: standalone`, run as a systemd service per-agent.
- It writes to `~/.hermes/inbox/<agent>.jsonl` as a fallback.
- The supposed consumer (`squad-inbox-gateway`) is a stub: `plugin.yaml` exists, `plugin.py` does not. No process is running. So the JSONL files are never read.
- **No squad agent has been receiving wake events for at least 24+ hours.** Tasks dispatched via `squad-dispatch-redis.py` are logged and tracked, but the actual `elmo ❯` prompt never sees them.

**Why we didn't notice sooner**: The squad agents stay running and responsive. When you walk up to one with `tmux send-keys` (or a direct CLI session), it works. But the production dispatch path is silent.

**Fix priority**: HIGH. This is the load-bearing piece of the whole "jirito as primary assignment tool" thesis.

**Possible fixes** (in order of effort):
1. **Quick**: Replace `inject_synthetic_event` with `inject_message` and add a `pre_llm_call` hook in the plugin that polls the inbox file. Same pattern as squad-inbox-gateway (which we should also build).
2. **Right**: Implement `squad-inbox-gateway` properly (it's already specced — just stub YAML). Make it also poll `default.jsonl` for Evo's profile. Then have all wake-injector plugins write to their inbox file as a guaranteed-delivery path.
3. **Alternative**: Have the plugin send a Discord message directly to #operations when a wake-worthy event fires. Crude but reliable, and the user can react to it.

### 🟡 Finding 2 — tmux send-keys has hidden costs

**Symptom**: `tmux send-keys -t squad-elmo C-c` closed Elmo's entire session.

**Root cause**: First Ctrl+C interrupted the input buffer. Second Ctrl+C was interpreted as "exit the CLI" (a feature). Elmo's session ended cleanly with "Resume this session with: hermes --resume 20260616_124841_1affac -p elmo".

**Fix**:
- For future manual wake injections: use `tmux load-buffer <file> + tmux paste-buffer -t <session> + tmux send-keys Enter` (avoids the multi-line-mangling issue AND avoids the Ctrl+C trap).
- Never use double Ctrl+C on a squad session unless you intend to kill it.
- The squad session survives a single Ctrl+C (interrupts current operation), but two in a row exits.

### 🟡 Finding 3 — PR diff is large because of branch accumulation

**Symptom**: PR #21 shows 16 files changed / +2662 lines, but the ticket's work is just 10 lines.

**Root cause**: `feat/squad-integration` is the cumulative branch for all phases 1-9. The PR against `main` shows the full diff since main. This is by design (per Kyle's branch rule from 2026-06-16), but reviewers need to look at the **last commit** (the ticket-specific change) rather than the full diff.

**Fix**: For future reviews, use `git show <commit-sha>` to see the ticket's specific change, not `gh pr diff` against main.

## Manual workaround used for the E2E

Since the wake is broken, I had to manually inject the task into Elmo's session. Sequence:

```bash
# 1. Restart Elmo's session (I had killed it with Ctrl+C during a prior attempt)
tmux new-session -d -s squad-elmo -x 220 -y 50 \
  "HERMES_PROFILE=elmo /home/kyle/.hermes/venv/bin/hermes --profile elmo --yolo 2>&1 | tee /home/kyle/.hermes/logs/squad-cli-elmo.log"

# 2. Wait for clean prompt
for i in 1 2 3 4 5 6; do
  sleep 5
  tmux capture-pane -t squad-elmo -p | grep -q "elmo ❯" && break
done

# 3. Inject prompt via paste buffer (avoids multi-line send-keys issues)
tmux load-buffer /tmp/elmo-phase9-prompt.txt
tmux paste-buffer -t squad-elmo
sleep 2
tmux send-keys -t squad-elmo Enter
```

Elmo processed the task in ~3 minutes (40+ tool calls), wrote the receipt, posted a comment with the PR link, and returned to idle. The full E2E worked end-to-end **except** for the wake delivery step.

## What Kyle can do now

1. **Open the dashboard** at `http://100.95.111.112:3001` (Tailscale). See ticket #112 in the `review` column with the PR link.
2. **Manually move #112 to done** to close out the E2E.
3. **For step B (your next ticket)**: I'll need to act as the wake relay. The flow will be:
   - You create the ticket via the dashboard
   - I see the wiretap entry (in logs), pull the ticket, dispatch the agent
   - I do the manual tmux injection since the wake is broken
4. **Real usage**: until the wake is fixed, treat jirito as a write-only source. I'll watch for new tickets via the outbox/bridge/plugin pipeline and proactively triage.

## Follow-ups

1. **Fix wake injection** (HIGH). See Finding 1. Recommend option 2 (implement squad-inbox-gateway properly + extend to default profile).
2. **Update jirito plugin** to use `inject_message` (cosmetic — works once ctx is available, but the API name is wrong).
3. **Update all wake-injector plugins** to write to `~/.hermes/inbox/<profile>.jsonl` as a guaranteed-delivery path, even if ctx-based injection succeeds. Belt and suspenders.
4. **Document the tmux send-keys gotcha** in the squad-clis skill. (Can be done after the wake is fixed — the manual injection is a temporary measure.)
5. **Phase 7 spec section** ("Squad Agent Protocol Skill") was never built as a separate skill — the agent protocol lives inline in dispatch prompts. Decide whether to extract it as a skill for reuse. Low priority.

## Verification checklist (from plan §9)

- [x] End-to-end test passes: ticket moves from `backlog` → `inprogress` → `review`
- [x] #operations shows the sign-off line: `🟢 JIRITO-112 ready for sign-off — …`
- [ ] jirito UI shows the ticket in the `Done` column (Kyle's manual move pending)
- [x] Outbox is empty (all events delivered) — verified at end
- [x] No errors in any logs (other than the expected `inject_failed` for the broken wake)

## Related

- Plan: `docs/JIRITO_SQUAD_IMPLEMENTATION_PLAN.md`
- Spec: `docs/JIRITO_SQUAD_SPEC.md`
- Plugin source: `~/.hermes/plugins/jirito-event-injector/plugin.py`
- Wiretap log: `~/.hermes/logs/jirito-event-injector-wiretap.log`
- Elmo's receipt: `~/squad-output/jirito-integration/phase-9/elmo.json`
