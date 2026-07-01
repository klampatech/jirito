/**
 * src/main-modals.ts — Create-issue modal helpers + button wiring.
 *
 * Conversion notes from src/main-modals.js:
 *   - 1:1 translation. `openModal` / `closeModal` are exported and
 *     imported by other bootstrap modules (`main-issue-form.ts`,
 *     `main-shortcuts.ts`, `main-column-menu.ts`).
 *   - Issue-form submission itself is handled by `main-issue-form.ts`.
 */

export function openModal(status?: string): void {
  const overlay = document.getElementById("modal-overlay");
  const statusEl = document.getElementById("issue-status") as HTMLInputElement | null;
  if (overlay) overlay.style.display = "flex";
  if (statusEl) statusEl.value = status || "todo";
  document.getElementById("issue-title")?.focus();
}

export function closeModal(): void {
  const overlay = document.getElementById("modal-overlay");
  const form = document.getElementById("issue-form") as HTMLFormElement | null;
  if (overlay) overlay.style.display = "none";
  if (form) form.reset();
}

export function initModals(): void {
  document.getElementById("add-issue-btn")?.addEventListener("click", () => openModal());
  document.getElementById("modal-close")?.addEventListener("click", closeModal);
  document.getElementById("modal-cancel")?.addEventListener("click", closeModal);
  document.getElementById("modal-overlay")?.addEventListener("click", (e: Event) => {
    if (!(e.target as HTMLElement).closest(".modal")) closeModal();
  });

  // Add card buttons — use event delegation on #board since the column
  // buttons are created by renderBoard() which runs after initModals()
  // during startup, and renderBoard() is also called on project/view
  // switches, so any static querySelectorAll would miss dynamically
  // created .btn-add-card buttons.
  document.getElementById("board")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".btn-add-card");
    if (!btn) return;
    const status = btn.dataset.status || "todo";
    openModal(status);
  });
}
