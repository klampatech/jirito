/**
 * src/main-filter-controls.ts — sprint filter + search debounce.
 *
 * Conversion notes from src/main-filter-controls.js:
 *   - 1:1 translation. `applyFilters` and `renderBoard` are provided by
 *     `events.ts` and `render.ts` respectively.
 *   - The legacy `main-filter-controls.js` re-declares a search-input
 *     listener that `main-filters.js` also wires. Both attach to the
 *     same DOM element with the same 200ms debounce; behaviour is
 *     preserved (multiple listeners do not double-fire `applyFilters`
 *     because each debounce window is independent).
 */

import { attach } from "./_attach.js";

export function initFilterControls(): void {
  // Sprint filter
  const sprintFilter = document.getElementById("sprint-filter") as HTMLSelectElement | null;
  if (sprintFilter) {
    sprintFilter.addEventListener("change", () => {
      applyFilters();
      renderBoard();
    });
  }

  // Filter controls (search-input already wired by main-filters.js,
  // but the legacy code re-debounces here as a safety net; preserved).
  let filterTimeout: ReturnType<typeof setTimeout> | undefined;
  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (filterTimeout) clearTimeout(filterTimeout);
      filterTimeout = setTimeout(applyFilters, 200);
    });
  }
  (document.getElementById("filter-type") as HTMLSelectElement | null)?.addEventListener("change", applyFilters);
  (document.getElementById("filter-priority") as HTMLSelectElement | null)?.addEventListener("change", applyFilters);
  (document.getElementById("filter-assignee") as HTMLSelectElement | null)?.addEventListener("change", applyFilters);
}

declare function applyFilters(): void;
declare function renderBoard(): void;

attach({ initFilterControls });
