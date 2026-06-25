/**
 * src/main-filters.ts — search-input + filter-select change handlers.
 *
 * Conversion notes from src/main-filters.js:
 *   - 1:1 translation. `applyFilters` is imported from `./events.js`.
 *   - Search input is debounced at 200ms (legacy behaviour).
 *   - JIRITO-123: filter values are persisted to localStorage so they
 *     survive page refresh. Without this, the user types a search,
 *     hits refresh, and the search box is empty. The persistence key
 *     is `jirito-filters` (one object with all five filter values).
 */

import { applyFilters } from "./events.js";

const FILTER_STORAGE_KEY = "jirito-filters";

interface FilterValues {
  search: string;
  type: string;
  priority: string;
  assignee: string;
  sprint: string;
}

const DEFAULT_FILTERS: FilterValues = {
  search: "",
  type: "all",
  priority: "all",
  assignee: "all",
  sprint: "all",
};

function loadFilters(): FilterValues {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<FilterValues>) };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

export function saveFilters(values: FilterValues): void {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

export function currentFilterValues(): FilterValues {
  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  const filterType = document.getElementById("filter-type") as HTMLSelectElement | null;
  const filterPriority = document.getElementById("filter-priority") as HTMLSelectElement | null;
  const filterAssignee = document.getElementById("filter-assignee") as HTMLSelectElement | null;
  const sprintFilter = document.getElementById("sprint-filter") as HTMLSelectElement | null;
  return {
    search: searchInput?.value ?? "",
    type: filterType?.value ?? "all",
    priority: filterPriority?.value ?? "all",
    assignee: filterAssignee?.value ?? "all",
    sprint: sprintFilter?.value ?? "all",
  };
}

/**
 * Apply persisted filter values to the DOM. Called on init and after
 * SSE re-syncs (since renderBoard() rebuilds the filter dropdowns).
 */
export function restoreFilterValues(): void {
  const stored = loadFilters();
  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  if (searchInput && searchInput.value !== stored.search) {
    searchInput.value = stored.search;
  }
  const filterType = document.getElementById("filter-type") as HTMLSelectElement | null;
  if (filterType && filterType.value !== stored.type) {
    filterType.value = stored.type;
  }
  const filterPriority = document.getElementById("filter-priority") as HTMLSelectElement | null;
  if (filterPriority && filterPriority.value !== stored.priority) {
    filterPriority.value = stored.priority;
  }
  const filterAssignee = document.getElementById("filter-assignee") as HTMLSelectElement | null;
  if (filterAssignee && filterAssignee.value !== stored.assignee) {
    filterAssignee.value = stored.assignee;
  }
  const sprintFilter = document.getElementById("sprint-filter") as HTMLSelectElement | null;
  if (sprintFilter && sprintFilter.value !== stored.sprint) {
    sprintFilter.value = stored.sprint;
  }
}

export function initFilters(): void {
  // Restore persisted values first so the DOM is in the right state
  // before any filter event fires (matters for the very first
  // applyFilters() call below).
  restoreFilterValues();
  applyFilters();

  // Debounce search input
  let filterTimeout: ReturnType<typeof setTimeout> | undefined;
  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (filterTimeout) clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        saveFilters(currentFilterValues());
        applyFilters();
      }, 200);
    });
  }

  const filterType = document.getElementById("filter-type") as HTMLSelectElement | null;
  if (filterType) {
    filterType.addEventListener("change", () => {
      saveFilters(currentFilterValues());
      applyFilters();
    });
  }

  const filterPriority = document.getElementById("filter-priority") as HTMLSelectElement | null;
  if (filterPriority) {
    filterPriority.addEventListener("change", () => {
      saveFilters(currentFilterValues());
      applyFilters();
    });
  }

  const filterAssignee = document.getElementById("filter-assignee") as HTMLSelectElement | null;
  if (filterAssignee) {
    filterAssignee.addEventListener("change", () => {
      saveFilters(currentFilterValues());
      applyFilters();
    });
  }
}

