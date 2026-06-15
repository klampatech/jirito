/**
 * src/main-save-filter.ts — wires the "Save Current Filter" button.
 *
 * Conversion notes from src/main-save-filter.js:
 *   - 1:1 translation; `saveCurrentFilter` is imported from `./render.js`.
 */

import { saveCurrentFilter } from "./render.js";

export function initSaveFilter(): void {
  document.getElementById("save-filter-btn")?.addEventListener("click", saveCurrentFilter);
}
