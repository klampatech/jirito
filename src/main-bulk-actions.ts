/**
 * src/main-bulk-actions.ts — multi-issue bulk operations.
 *
 * Conversion notes from src/main-bulk-actions.js:
 *   - 1:1 translation. The bulk-status / bulk-delete handlers are
 *     wired in `events.ts` (handleBulkStatusChange / handleBulkDelete
 *     / handleBulkClear).
 *   - The legacy file uses `saveStateDebounced()` on lines 15 and 29.
 *     That function does not exist anywhere in the codebase — those
 *     two event listeners are bound to `bulk-priority` and
 *     `bulk-assignee`, which are hidden in the HTML (`display:none`).
 *     The bug is therefore dormant; the calls are preserved verbatim
 *     so that a future unhide triggers the same (broken) behaviour.
 *   - `selectedIds` is a module-scope `Set` alias that pre-dates the
 *     LJ-namespace cleanup. It is also unused in practice (the only
 *     `selectedIds.has(i.id)` calls live behind hidden elements), so
 *     it is declared but not guaranteed to be the same object as
 *     `getSelectedIds()`.
 */

import type { Issue } from "./types";
import { attach } from "./_attach";

export function initBulkActions(): void {
  document.getElementById("bulk-status")?.addEventListener("change", handleBulkStatusChange);
  document.getElementById("bulk-delete")?.addEventListener("click", handleBulkDelete);
  document.getElementById("bulk-clear")?.addEventListener("click", handleBulkClear);
  document.getElementById("bulk-priority")?.addEventListener("change", (e: Event) => {
    const priority = (e.target as HTMLSelectElement).value as Issue["priority"];
    if (!priority) return;
    getIssues().forEach((i) => {
      if (selectedIds.has(i.id)) {
        trackHistory(i, "priority", i.priority, priority);
        i.priority = priority;
      }
    });
    saveStateDebounced();
    renderBoard();
    updateCounts();
    (e.target as HTMLSelectElement).value = "";
  });
  document.getElementById("bulk-assignee")?.addEventListener("change", (e: Event) => {
    const assignee = (e.target as HTMLSelectElement).value;
    if (!assignee) return;
    getIssues().forEach((i) => {
      if (selectedIds.has(i.id)) {
        trackHistory(i, "assignee", i.assignee || "", assignee);
        i.assignee = assignee;
      }
    });
    saveStateDebounced();
    renderBoard();
    updateCounts();
    (e.target as HTMLSelectElement).value = "";
  });
}

declare function handleBulkStatusChange(e: Event): void;
declare function handleBulkDelete(): void;
declare function handleBulkClear(): void;
declare function getIssues(): Issue[];
declare function trackHistory(issue: Issue, field: string, from: string | number | null, to: string | number | null): void;
declare function saveStateDebounced(): Promise<void>;
declare function renderBoard(): void;
declare function updateCounts(): void;

// Pre-existing global alias. See conversion notes above.
declare let selectedIds: Set<Issue["id"]>;

attach({ initBulkActions });
