/**
 * src/main-detail-panel.ts — detail panel close button + backdrop.
 *
 * Conversion notes from src/main-detail-panel.js:
 *   - 1:1 translation; `closeDetailPanel` is imported from `./events.js`.
 */
import { closeDetailPanel } from "./events.js";
export function initDetailPanel() {
    document.getElementById("detail-close")?.addEventListener("click", closeDetailPanel);
    // Detail panel backdrop close
    document.getElementById("detail-backdrop")?.addEventListener("click", closeDetailPanel);
}
//# sourceMappingURL=main-detail-panel.js.map