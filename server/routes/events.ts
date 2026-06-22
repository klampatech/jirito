/**
 * server/routes/events.ts — Server-Sent Events (SSE) endpoint.
 *
 * Provides /api/events for browser clients to receive real-time ticket
 * updates. When any agent (or kyle directly) changes a ticket through
 * the REST API, the mutation handler calls broadcastEvent() to push the
 * event to all connected EventSource clients. The browser re-renders
 * the board without a page refresh.
 *
 * Design:
 * - In-memory client registry (Set<ServerResponse>). Works for the
 *   single-server deployment jirito uses. If multi-server is needed
 *   later, swap to Redis pub/sub — the interface stays the same.
 * - SSE comment heartbeat every 30s keeps proxies/alb happy.
 * - Each event is sent as `data: <json>\n\n` (json lines format).
 * - Clients reconnect automatically via EventSource spec.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

// In-memory client registry — one entry per open /api/events connection.
const clients = new Set<ServerResponse>();

/** Register a new SSE client. Called on GET /api/events. */
export function addClient(res: ServerResponse): void {
  clients.add(res);
  console.log(`[sse] client connected (${clients.size} total)`);
}

/** Remove a client. Called when the connection closes. */
export function removeClient(res: ServerResponse): void {
  clients.delete(res);
  console.log(`[sse] client disconnected (${clients.size} total)`);
}

/** Broadcast a ticket event to all connected SSE clients. */
export function broadcastEvent(
  event_type: string,
  payload: Record<string, unknown>
): void {
  if (clients.size === 0) return;

  const data = JSON.stringify({ event_type, payload });
  const message = `data: ${data}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch (err) {
      // Client disconnected mid-write — clean up.
      console.warn("[sse] write failed, removing client:", (err as Error).message);
      clients.delete(client);
    }
  }
}

/** Route handler for GET /api/events. Sets up SSE headers and keeps the connection open. */
export async function handleSSE(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Disable nginx/Cloudflare buffering so events reach the client immediately.
    "X-Accel-Buffering": "no",
  });

  // Send an initial "connected" comment so EventSource fires its open event.
  res.write(": connected\n\n");

  addClient(res);

  // Heartbeat comment every 30s to keep the connection alive through proxies.
  const heartbeat = setInterval(() => {
    if (!clients.has(res)) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      removeClient(res);
    }
  }, 30_000);

  // Clean up when the client disconnects.
  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
}
