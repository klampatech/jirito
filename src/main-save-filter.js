/**
 * src/main-save-filter.ts — wires the "Save Current Filter" button.
 *
 * Conversion notes from src/main-save-filter.js:
 *   - 1:1 translation; `saveCurrentFilter` is provided by `render.ts`
 *     (attached to `window` via `attach()`).
 */
import { attach } from "./_attach.js";
export function initSaveFilter() {
    document.getElementById("save-filter-btn")?.addEventListener("click", saveCurrentFilter);
}
attach({ initSaveFilter });
//# sourceMappingURL=main-save-filter.js.map