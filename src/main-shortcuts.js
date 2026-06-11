/**
 * src/main-shortcuts.ts — global keyboard shortcuts.
 *
 * Conversion notes from src/main-shortcuts.js:
 *   - 1:1 translation.
 *   - `currentUndoCallback` is a module-scope `let` in `events.ts`.
 *     In the legacy classic-script world it was a global; here it is
 *     declared as such and read by the (Ctrl/Cmd)+Z handler. The
 *     removal in `removeUndoToast()` is the only place that nulls
 *     it. Behaviour is preserved.
 */
import { attach } from "./_attach";
export function initShortcuts() {
    // Global keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const panel = document.getElementById("detail-panel");
            if (panel && panel.classList.contains("open")) {
                closeDetailPanel();
                return;
            }
            const modal = document.getElementById("modal-overlay");
            if (modal && modal.style.display === "flex") {
                closeModal();
                return;
            }
            const projectModal = document.getElementById("project-modal-overlay");
            if (projectModal && projectModal.style.display === "flex") {
                projectModal.style.display = "none";
                return;
            }
            const onboarding = document.getElementById("onboarding-overlay");
            if (onboarding && onboarding.style.display === "flex") {
                onboarding.style.display = "none";
                return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            document.getElementById("search-input")?.focus();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "n") {
            e.preventDefault();
            openModal();
        }
        // Ctrl+Z / Cmd+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            const cb = getCurrentUndoCallback();
            if (cb) {
                cb();
                removeUndoToast();
            }
        }
        // Arrow key navigation for cards
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.ctrlKey && !e.metaKey) {
            const active = document.activeElement;
            if (active && active.classList.contains("issue-card")) {
                e.preventDefault();
                const column = active.closest(".column-body");
                if (!column)
                    return;
                const cards = Array.from(column.querySelectorAll(".issue-card:not(.dragging)"));
                const idx = cards.indexOf(active);
                const nextIdx = e.key === "ArrowDown" ? Math.min(idx + 1, cards.length - 1) : Math.max(idx - 1, 0);
                if (nextIdx !== idx) {
                    cards[nextIdx].focus();
                }
            }
        }
    });
}
attach({ initShortcuts });
//# sourceMappingURL=main-shortcuts.js.map