# Jirito Webhook Bridge

Standalone Node service that accepts POST /webhook and publishes events to Redis channel `jirito_events`.

## Quick start

```bash
cd bridge && npm install
systemctl --user daemon-reload
systemctl --user enable jirito-bridge.service
systemctl --user start jirito-bridge.service
```

## Service management

| Action | Command |
|--------|---------|
| Start | `systemctl --user start jirito-bridge.service` |
| Stop | `systemctl --user stop jirito-bridge.service` |
| Status | `systemctl --user status jirito-bridge.service` |
| Logs | `tail -f ~/.hermes/logs/jirito-bridge.log` |
| Restart | `systemctl --user restart jirito-bridge.service` |

## Systemd unit

The systemd unit lives at:

```
~/.config/systemd/user/jirito-bridge.service
```

Not inside the repo — it is managed by systemd and persists independently of the git tree. If you pull a new version of the bridge, `systemctl --user restart jirito-bridge.service` to pick it up.

## Endpoints

- `GET /health` — returns `{ status: "ok", redis: "connected" | "disconnected" }`
- `POST /webhook` — accepts envelope `{ event_id, event_type, timestamp, source, payload }`, publishes to Redis `jirito_events` channel

## Environment

- Listens on `127.0.0.1:3030` (not exposed externally)
- Redis via `redis://localhost:6379`
- Logs to `~/.hermes/logs/jirito-bridge.log`
