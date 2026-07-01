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
import { getProjectKey } from "./_shared.js";

/**
 * Auto-decorate a ticket.* event payload with `projectKey` when the
 * caller omitted it (JIRITO-124 fix, 2026-06-30).
 *
 * Background: every `ticket.*` emit in the codebase spreads the full
 * `Issue` row into its payload, which already carries `projectId`
 * (the project the ticket BELONGS to). But downstream consumers —
 * the jirito-event-injector plugin and the squad agent — render the
 * ticket's display prefix from `projectKey` (e.g. `ORCA`/`JIRITO`).
 * Before this helper, the wake/PR text hardcoded `JIRITO-`, so an
 * ORCA ticket arrived at the agent as `JIRITO-120`. The agent then
 * branched/PR'd from the wrong repo (klampatech/jirito instead of
 * the ORCA project repo).
 *
 * The fix: every `ticket.*` emit carries `projectKey` computed at
 * emit time from the projects table. Returns the same payload
 * object if no `projectId` is present (e.g. `ticket.deleted` may
 * be missing the row, or `ticket.assigned` carrying an assignee
 * change where the row hasn't been refetched) — caller-provided
 * `projectKey` is preserved.
 */
export function decorateTicketPayload(
  event_type: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!event_type.startsWith("ticket.")) return payload;
  if (typeof payload.projectKey === "string" && payload.projectKey.trim()) {
    return payload;
  }
  const projectId = payload.projectId;
  if (typeof projectId !== "string" || !projectId.trim()) return payload;
  const projectKey = getProjectKey(projectId);
  if (projectKey === projectId && !payload.projectKey) {
    // getProjectKey falls back to the raw id when the row is gone or
    // has no key column. Still surface it so the plugin doesn't print
    // bare numbers — even a degraded prefix beats "PROJ".
    return { ...payload, projectKey };
  }
  return { ...payload, projectKey };
}

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

/**
 * Broadcast a ticket event to all connected SSE clients.
 *
 * Auto-decorates the payload with `projectKey` (derived from
 * `projectId` via the projects table) when the caller omitted it.
 * See `decorateTicketPayload` for the rationale.
 */
export function broadcastEvent(
  event_type: string,
  payload: Record<string, unknown>
): void {
  const enriched = decorateTicketPayload(event_type, payload);
  if (clients.size === 0) return;
  // NOTE: Unlike emitEvent (Discord webhook), SSE does NOT honor the
  // X-Jirito-Silent header. The "silent" flag was designed to keep
  // Playwright fixture writes out of the Discord wiretap; SSE is a
  // in-process browser feed that has nothing to do with Discord, and
  // tests that PUT a status change to verify the board updates in
  // real-time NEED the broadcast to reach the test page. Suppressing
  // it here would silently re-introduce the JIRITO-122 bug for any
  // test that uses silent fixtures.

  const data = JSON.stringify({ event_type, payload: enriched });
  // SSE protocol: name the event with the `event:` line so the browser's
  // `addEventListener("<type>", handler)` fires. The previous format
  // (`data: { event_type, payload }\n\n`) emitted a generic "message"
  // event that no named listener ever matched — the board would only
  // refresh if something listened via `onmessage`. See src/sse-client.ts
  // which uses `addEventListener("ticket.moved", ...)` etc.
  const message = `event: ${event_type}\ndata: ${data}\n\n`;

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
