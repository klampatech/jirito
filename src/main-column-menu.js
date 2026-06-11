/**
 * src/main-column-menu.ts — per-column action menu (rename / add card / clear).
 *
 * Conversion notes from src/main-column-menu.js:
 *   - 1:1 translation. The menu is built inline with hardcoded
 *     `style.cssText` strings (matches the legacy behaviour and is
 *     the one place the code-review explicitly flagged for theme
 *     hardcoding — preserved verbatim for now; refactor is in a
 *     separate task).
 *   - The clear-column action supports both status-mapped and custom
 *     columns; the `isCustom` branch uses `customColumnId` for routing.
 *     NOTE: This is the one place the custom-column routing
 *     half-works — the render path in `renderBoard()` is still
 *     status-only, so custom-column cards are not visible on the
 *     board yet. The clear logic itself is correct.
 */
import { attach } from "./_attach";
export function initColumnMenuButtons() {
    document.querySelectorAll(".column-menu-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const column = btn.closest(".column");
            if (!column)
                return;
            const colId = column.dataset.colId ?? "";
            const colDef = getEffectiveColumns().find((c) => c.id === colId);
            const status = colDef?.status || column.dataset.status || "";
            const isCustom = !colDef?.status;
            const menu = document.createElement("div");
            menu.className = "column-menu";
            menu.style.cssText = `position:absolute;top:36px;right:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.12);z-index:60;min-width:180px;padding:4px 0;`;
            menu.innerHTML = `
        <button class="column-menu-item" data-action="rename" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;">
          ${lucideIcon("Pencil", { class: "icon-sm" })} Rename column
        </button>
        <button class="column-menu-item" data-action="add-card" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;">
          ${lucideIcon("Plus", { class: "icon-sm" })} Add card
        </button>
        <button class="column-menu-item" data-action="clear-column" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--danger);cursor:pointer;">
          ${lucideIcon("Trash", { class: "icon-sm" })} Clear all cards
        </button>
        <hr style="border:none;border-top:1px solid var(--border-light);margin:4px 0;">
        <button class="column-menu-item" data-action="close" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text-muted);cursor:pointer;">
          ${lucideIcon("X", { class: "icon-sm" })} Close
        </button>
      `;
            const header = btn.closest(".column-header");
            if (!header)
                return;
            header.style.position = "relative";
            header.appendChild(menu);
            const closeMenu = (ev) => {
                if (!header.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener("click", closeMenu);
                }
            };
            document.addEventListener("click", closeMenu);
            menu.querySelectorAll(".column-menu-item").forEach((item) => {
                item.addEventListener("click", () => {
                    const action = item.dataset.action;
                    if (action === "close" || action === "rename" || action === "add-card" || action === "clear-column") {
                        menu.remove();
                    }
                    if (action === "rename") {
                        const newName = prompt("Rename column:", colDef?.name || status);
                        if (newName && newName.trim()) {
                            const titleSpan = column.querySelector(".column-title span:nth-child(2)");
                            if (titleSpan)
                                titleSpan.textContent = newName.trim();
                            if (colDef) {
                                updateCustomColumn(colId, { name: newName.trim() });
                            }
                            addActivity("Pencil", `Renamed column to <strong>${escapeHtml(newName.trim())}</strong>`);
                        }
                    }
                    if (action === "add-card") {
                        openModal();
                    }
                    if (action === "clear-column") {
                        // Get issues in this column (by status or customColumnId)
                        const columnIssues = isCustom
                            ? getIssues().filter((i) => i.customColumnId === colId)
                            : getIssues().filter((i) => i.status === status);
                        const count = columnIssues.length;
                        if (count === 0)
                            return;
                        const columnName = colDef?.name || status;
                        if (confirm(`Delete all ${count} cards in this column?`)) {
                            // Store for undo
                            const clearedIssues = [...columnIssues];
                            // Remove issues from the column
                            if (isCustom) {
                                columnIssues.forEach((i) => {
                                    i.customColumnId = null;
                                    i.status = "todo";
                                });
                            }
                            else {
                                setIssues(getIssues().filter((i) => i.status !== status));
                            }
                            saveStateImmediate();
                            renderBoard();
                            updateCounts();
                            addActivity("Trash", `Cleared ${count} cards from <strong>${escapeHtml(columnName)}</strong>`);
                            showUndoToast(`${count} cards cleared`, () => {
                                // Restore issues to their original column
                                clearedIssues.forEach((i) => {
                                    const issue = pickIssue(i.id);
                                    if (issue) {
                                        if (isCustom) {
                                            issue.customColumnId = colId;
                                        }
                                        else {
                                            issue.status = i.status;
                                        }
                                    }
                                });
                                saveStateImmediate();
                                renderBoard();
                                updateCounts();
                                removeUndoToast();
                                showToast("Cards restored", "success");
                            });
                        }
                    }
                });
            });
        });
    });
}
attach({ initColumnMenuButtons });
//# sourceMappingURL=main-column-menu.js.map