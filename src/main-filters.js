/**
 * src/main-filters.ts — search-input + filter-select change handlers.
 *
 * Conversion notes from src/main-filters.js:
 *   - 1:1 translation. `applyFilters` is imported from `./events.js`.
 *   - Search input is debounced at 200ms (legacy behaviour).
 */
import { applyFilters } from "./events.js";
export function initFilters() {
    // Debounce search input
    let filterTimeout;
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            if (filterTimeout)
                clearTimeout(filterTimeout);
            filterTimeout = setTimeout(applyFilters, 200);
        });
    }
    const filterType = document.getElementById("filter-type");
    if (filterType) {
        filterType.addEventListener("change", applyFilters);
    }
    const filterPriority = document.getElementById("filter-priority");
    if (filterPriority) {
        filterPriority.addEventListener("change", applyFilters);
    }
    const filterAssignee = document.getElementById("filter-assignee");
    if (filterAssignee) {
        filterAssignee.addEventListener("change", applyFilters);
    }
}
//# sourceMappingURL=main-filters.js.map