/**
 * src/main-modals.ts — Create-issue modal helpers + button wiring.
 *
 * Conversion notes from src/main-modals.js:
 *   - 1:1 translation. `openModal` / `closeModal` are exported and
 *     imported by other bootstrap modules (`main-issue-form.ts`,
 *     `main-shortcuts.ts`, `main-column-menu.ts`).
 *   - Issue-form submission itself is handled by `main-issue-form.ts`.
 */
export function openModal(status) {
    const overlay = document.getElementById("modal-overlay");
    const statusEl = document.getElementById("issue-status");
    if (overlay)
        overlay.style.display = "flex";
    if (statusEl)
        statusEl.value = status || "todo";
    document.getElementById("issue-title")?.focus();
}
export function closeModal() {
    const overlay = document.getElementById("modal-overlay");
    const form = document.getElementById("issue-form");
    if (overlay)
        overlay.style.display = "none";
    if (form)
        form.reset();
}
export function initModals() {
    document.getElementById("add-issue-btn")?.addEventListener("click", () => openModal());
    document.getElementById("modal-close")?.addEventListener("click", closeModal);
    document.getElementById("modal-cancel")?.addEventListener("click", closeModal);
    document.getElementById("modal-overlay")?.addEventListener("click", (e) => {
        if (!e.target.closest(".modal"))
            closeModal();
    });
    // Add card buttons (delegate to column footer)
    document.querySelectorAll(".btn-add-card").forEach((btn) => {
        btn.addEventListener("click", () => openModal());
    });
}
//# sourceMappingURL=main-modals.js.map