/**
 * src/main-trash.ts — recently-deleted issues list (sidebar).
 *
 * Conversion notes from src/main-trash.js:
 *   - 1:1 translation. Unlike the other main-*.ts files, this one
 *     exports `renderTrash` (not an `init*`) because the orchestrator
 *     calls it directly after first render. `restoreFromTrash` is
 *     provided by `state.ts`.
 */
import { attach } from "./_attach";
export function renderTrash() {
    const section = document.getElementById("trash-section");
    const list = document.getElementById("trash-list");
    const count = document.getElementById("trash-count");
    if (!section || !list || !count)
        return;
    if (getTrash().length === 0) {
        section.style.display = "none";
        return;
    }
    section.style.display = "block";
    count.textContent = `(${getTrash().length})`;
    list.innerHTML = getTrash()
        .map((t, idx) => `
    <div class="trash-item">
      <span class="trash-item-title">${(t.issues ?? []).map((i) => escapeHtml(i.title)).join(", ")}</span>
      <button class="trash-restore" data-idx="${idx}">Restore</button>
    </div>
  `)
        .join("");
    list.querySelectorAll(".trash-restore").forEach((btn) => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx ?? "-1", 10);
            if (idx >= 0) {
                restoreFromTrash(idx);
                renderTrash();
                showToast("Issue restored", "success");
            }
        });
    });
}
attach({ renderTrash });
//# sourceMappingURL=main-trash.js.map