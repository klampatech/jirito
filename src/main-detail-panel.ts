/**
 * src/main-detail-panel.ts — detail panel close button + backdrop.
 *
 * Conversion notes from src/main-detail-panel.js:
 *   - 1:1 translation; `closeDetailPanel` is provided by `events.ts`
 *     (attached to `window` via `attach()`).
 */

import { attach } from "./_attach";

export function initDetailPanel(): void {
  document.getElementById("detail-close")?.addEventListener("click", closeDetailPanel);
  // Detail panel backdrop close
  document.getElementById("detail-backdrop")?.addEventListener("click", closeDetailPanel);
}

// Cross-module symbol provided at runtime by `events.ts` via `attach()`.
declare function closeDetailPanel(): void;

attach({ initDetailPanel });
