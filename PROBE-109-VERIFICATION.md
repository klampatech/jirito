# PROBE 109: Fix Verification

**Fix:** squad-inbox-gateway now looks up `_cli_ref` on `ctx._manager` (not `ctx` directly), enabling CLI mode injection into the tmux pane.

**Evidence:** `~/.hermes/profiles/elmo/logs/agent.log` (2026-06-17 09:51:05):

```
squad-inbox-gateway: inbox file shrunk (size=788 < last_pos=79...) — reset
squad-inbox-gateway: Injected task ba17b39a-7d37-4e93-81de-b63232af5e92 via inject_message (CLI → tmux pane)
```

**Ticket:** #109 — PROBE 51: dispatch path test post-fix
**Assignee:** elmo
**Status:** verified ✓
