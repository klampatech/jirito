/**
 * Jirito webhook bridge — accepts POST /webhook, publishes to Redis channel.
 * Supervised by systemd user unit.
 */

import { createServer } from "node:http";
import { URL } from "node:url";
import { createClient } from "redis";

const PORT = 3030;
const HOST = "127.0.0.1";
const REDIS_CHANNEL = "jirito_events";

const log = (level, msg, extras = {}) => {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extras })
  );
};

// Redis client
const redis = createClient({
  url: "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        log("error", "redis: max retries reached, giving up reconnect");
        return false;
      }
      return Math.min(retries * 500, 5000);
    },
  },
});

let redisConnected = false;

redis.on("connect", () => {
  redisConnected = true;
  log("info", "redis: connected");
});

redis.on("end", () => {
  redisConnected = false;
  log("info", "redis: disconnected");
});

redis.on("error", (err) => {
  log("error", "redis: error", { error: err.message });
});

// Connect on boot
await redis.connect();

// HTTP server
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // GET /health
  if (pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", redis: redisConnected ? "connected" : "disconnected" }));
    return;
  }

  // POST /webhook
  if (pathname === "/webhook" && req.method === "POST") {
    if (!redisConnected) {
      log("warn", "webhook: redis not connected, returning 503");
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "redis unavailable" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      if (body.length > 1024 * 1024) {
        // 1 MB cap
        body = "";
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", async () => {
      let envelope;
      try {
        envelope = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
        return;
      }

      const { event_id, event_type, timestamp, source, payload } = envelope;

      try {
        await redis.publish(REDIS_CHANNEL, JSON.stringify({ event_id, event_type, timestamp, source, payload }));
        log("info", "webhook: published", { event_id, event_type });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, event_id: event_id ?? null }));
      } catch (err) {
        log("error", "webhook: publish failed", { event_id, error: (err ?? {}).message });
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "redis publish failed" }));
      }
    });

    req.on("error", (err) => {
      log("error", "webhook: request error", { error: err.message });
    });
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, HOST, () => {
  log("info", `bridge: listening on ${HOST}:${PORT}`);
});

server.on("error", (err) => {
  log("error", "server: error", { error: err.message });
  process.exit(1);
});
