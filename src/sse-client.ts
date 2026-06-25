/**
 * src/sse-client.ts — Browser-side SSE client for real-time board updates.
 *
 * Connects to GET /api/events once when the app loads. On each ticket
 * event (created / updated / moved / deleted), re-syncs from the server
 * storage layer and re-renders the board — no page refresh required.
 *
 * EventSource automatically reconnects on drop. The `loadState()` call
 * inside the event handler will re-fetch fresh data from the server,
 * covering mutations from:
 *   - other browser tabs (via same-server /api/state PUT)
 *   - squad agents calling PUT /api/issues/<id> directly
 *   - kyle's direct REST calls
 */

import { storage } from "./storage.js";
import { initializeData } from "./state.js";
import { renderActivity, renderBoard } from "./render.js";
import { initDragDrop } from "./events.js";
import { restoreFilterValues } from "./main-filters.js";

let es: EventSource | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30_000;

function handleEvent(type: string): void {
  console.log(`[sse] received: ${type}, re-syncing board`);
  void syncAndRender();
}

async function syncAndRender(): Promise<void> {
  try {
    // Re-init the storage layer to pull the latest from the server.
    // In server mode this calls GET /api/state; in offline mode it
    // reads from localStorage. Either way, in-memory state gets fresh.
    await storage.initStorage();
    // Re-run the same initialization that loadState() does after a fresh load.
    initializeData();
    // Re-render the board with the new data.
    renderBoard();
    // JIRITO-107: also re-render the sidebar activity feed. Without this,
    // SSE-driven mutations re-fetch /api/state and update the in-memory
    // _activityLog (via setActivityLog in initializeData()), but the
    // sidebar DOM is never refreshed — leaving it stale until a full
    // page reload. renderActivity() is cheap (re-builds at most 15
    // items); renderSidebar() would also rebuild projects/views/filters
    // which is overkill for an event-driven update.
    renderActivity();
    // JIRITO-123: re-apply persisted filter values. renderBoard()
    // rebuilds the sprint-filter dropdown, which resets its value
    // to "all" — wiping the user's selection on every SSE event.
    // restoreFilterValues() reads from localStorage and re-sets the
    // DOM to the saved selection. Cheap (5 DOM writes).
    restoreFilterValues();
    // Re-attach drag-and-drop since renderBoard() rebuilds the DOM.
    // initDragDrop is idempotent — it's fine to call multiple times.
    initDragDrop();
  } catch (err) {
    console.error("[sse] syncAndRender failed:", err);
  }
}

export function initSSE(): void {
  if (es) return; // Already connected.

  connect();
}

function connect(): void {
  if (es) {
    es.close();
    es = null;
  }

  const url = "/api/events";
  console.log(`[sse] connecting to ${url}`);
  es = new EventSource(url);

  es.onopen = () => {
    console.log("[sse] connected");
    reconnectDelay = 1000; // Reset back-off on successful connection.
  };

  es.onerror = (err) => {
    console.warn("[sse] error, reconnecting in", reconnectDelay, "ms", err);
    es?.close();
    es = null;
    setTimeout(connect, reconnectDelay);
    // Exponential back-off, capped.
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  };

  // Listen for all ticket event types we broadcast from the server.
  // SSE EventSource matches event type to the handler name: on{type}.
  es.addEventListener("ticket.created", () => handleEvent("ticket.created"));
  es.addEventListener("ticket.updated", () => handleEvent("ticket.updated"));
  es.addEventListener("ticket.moved",   () => handleEvent("ticket.moved"));
  es.addEventListener("ticket.deleted", () => handleEvent("ticket.deleted"));
  es.addEventListener("ticket.assigned",() => handleEvent("ticket.assigned"));
  es.addEventListener("ticket.review",  () => handleEvent("ticket.review"));
}
