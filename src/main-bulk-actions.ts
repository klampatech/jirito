/**
 * src/main-bulk-actions.ts — multi-issue bulk operations.
 *
 * Conversion notes from src/main-bulk-actions.js:
 *   - 1:1 translation. The bulk-status / bulk-delete handlers are
 *     wired in `events.ts` (handleBulkStatusChange / handleBulkDelete
 *     / handleBulkClear).
 *   - The legacy file used `saveStateDebounced()` and a module-scope
 *     `selectedIds` alias. Both were pre-existing dead code (those
 *     elements are hidden in the HTML with `display:none`). As of
 *     plan §10.1, the `saveStateDebounced()` calls are replaced with
 *     `saveState()` (the only public save function) and `selectedIds`
 *     is replaced with `getSelectedIds()` (the typed accessor).
 *     The elements are still hidden, so the listeners never fire;
 *     the corrected code is in place in case the elements are
 *     re-shown.
 */

import { getIssues, getSelectedIds, saveState } from "./state.js";
import { handleBulkClear, handleBulkDelete, handleBulkStatusChange, trackHistory } from "./events.js";
import { renderBoard, updateCounts } from "./render.js";

export function initBulkActions(): void {
  document.getElementById("bulk-status")?.addEventListener("change", handleBulkStatusChange);
  document.getElementById("bulk-delete")?.addEventListener("click", handleBulkDelete);
  document.getElementById("bulk-clear")?.addEventListener("click", handleBulkClear);
  document.getElementById("bulk-priority")?.addEventListener("change", (e: Event) => {
    const priority = (e.target as HTMLSelectElement).value;
    if (!priority) return;
    getIssues().forEach((i) => {
      if (getSelectedIds().has(i.id)) {
        trackHistory(i, "priority", i.priority, priority);
        i.priority = priority as typeof i.priority;
      }
    });
    void saveState();
    renderBoard();
    updateCounts();
    (e.target as HTMLSelectElement).value = "";
  });
  document.getElementById("bulk-assignee")?.addEventListener("change", (e: Event) => {
    const assignee = (e.target as HTMLSelectElement).value;
    if (!assignee) return;
    getIssues().forEach((i) => {
      if (getSelectedIds().has(i.id)) {
        trackHistory(i, "assignee", i.assignee || "", assignee);
        i.assignee = assignee;
      }
    });
    void saveState();
    renderBoard();
    updateCounts();
    (e.target as HTMLSelectElement).value = "";
  });
}
