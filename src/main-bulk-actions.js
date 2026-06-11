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
import { attach } from "./_attach";
export function initBulkActions() {
    document.getElementById("bulk-status")?.addEventListener("change", handleBulkStatusChange);
    document.getElementById("bulk-delete")?.addEventListener("click", handleBulkDelete);
    document.getElementById("bulk-clear")?.addEventListener("click", handleBulkClear);
    document.getElementById("bulk-priority")?.addEventListener("change", (e) => {
        const priority = e.target.value;
        if (!priority)
            return;
        getIssues().forEach((i) => {
            if (selectedIds.has(i.id)) {
                trackHistory(i, "priority", i.priority, priority);
                i.priority = priority;
            }
        });
        saveStateDebounced();
        renderBoard();
        updateCounts();
        e.target.value = "";
    });
    document.getElementById("bulk-assignee")?.addEventListener("change", (e) => {
        const assignee = e.target.value;
        if (!assignee)
            return;
        getIssues().forEach((i) => {
            if (selectedIds.has(i.id)) {
                trackHistory(i, "assignee", i.assignee || "", assignee);
                i.assignee = assignee;
            }
        });
        saveStateDebounced();
        renderBoard();
        updateCounts();
        e.target.value = "";
    });
}
attach({ initBulkActions });
//# sourceMappingURL=main-bulk-actions.js.map