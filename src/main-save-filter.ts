/**
 * src/main-save-filter.ts — wires the "Save Current Filter" button.
 *
 * Conversion notes from src/main-save-filter.js:
 *   - 1:1 translation; `saveCurrentFilter` is provided by `render.ts`
 *     (attached to `window` via `attach()`).
 */

import { attach } from "./_attach";

export function initSaveFilter(): void {
  document.getElementById("save-filter-btn")?.addEventListener("click", saveCurrentFilter);
}

declare function saveCurrentFilter(): void;

attach({ initSaveFilter });
