/**
 * src/main-detail-panel.ts — detail panel close button + backdrop.
 *
 * Conversion notes from src/main-detail-panel.js:
 *   - 1:1 translation; `closeDetailPanel` is provided by `events.ts`
 *     (attached to `window` via `attach()`).
 */
import { attach } from "./_attach.js";
export function initDetailPanel() {
    document.getElementById("detail-close")?.addEventListener("click", closeDetailPanel);
    // Detail panel backdrop close
    document.getElementById("detail-backdrop")?.addEventListener("click", closeDetailPanel);
}
attach({ initDetailPanel });
//# sourceMappingURL=main-detail-panel.js.map