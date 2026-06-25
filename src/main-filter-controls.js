/**
 * src/main-filter-controls.ts — sprint-filter change handler.
 *
 * The search-input and other filter-selects are wired in
 * `main-filters.ts`. The original `main-filter-controls.js` also
 * duplicated those listeners (pre-existing redundancy in the legacy
 * code). Removed: that duplicate just stacks two debounced handlers
 * on the same element. The sprint filter is unique to this file.
 *
 * JIRITO-123: sprint filter value persists to localStorage (handled
 * by `currentFilterValues()` / `saveFilters()` in main-filters.ts).
 */
import { applyFilters } from "./events.js";
import { renderBoard } from "./render.js";
import { currentFilterValues, saveFilters } from "./main-filters.js";
export function initFilterControls() {
    // Sprint filter
    const sprintFilter = document.getElementById("sprint-filter");
    if (sprintFilter) {
        sprintFilter.addEventListener("change", () => {
            saveFilters(currentFilterValues());
            applyFilters();
            renderBoard();
        });
    }
}
//# sourceMappingURL=main-filter-controls.js.map