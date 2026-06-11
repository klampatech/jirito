/**
 * src/main-filters.ts — search-input + filter-select change handlers.
 *
 * Conversion notes from src/main-filters.js:
 *   - 1:1 translation. `applyFilters` is provided by `events.ts`
 *     (attached via `attach()`).
 *   - Search input is debounced at 200ms (legacy behaviour).
 */

import { attach } from "./_attach";

export function initFilters(): void {
  // Debounce search input
  let filterTimeout: ReturnType<typeof setTimeout> | undefined;
  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (filterTimeout) clearTimeout(filterTimeout);
      filterTimeout = setTimeout(applyFilters, 200);
    });
  }

  const filterType = document.getElementById("filter-type") as HTMLSelectElement | null;
  if (filterType) {
    filterType.addEventListener("change", applyFilters);
  }

  const filterPriority = document.getElementById("filter-priority") as HTMLSelectElement | null;
  if (filterPriority) {
    filterPriority.addEventListener("change", applyFilters);
  }

  const filterAssignee = document.getElementById("filter-assignee") as HTMLSelectElement | null;
  if (filterAssignee) {
    filterAssignee.addEventListener("change", applyFilters);
  }
}

declare function applyFilters(): void;

attach({ initFilters });
