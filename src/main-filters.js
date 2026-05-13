// ===== Filter Module =====
// Handles: search input, filter controls

function initFilters() {
  // Debounce search input
  let filterTimeout;
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(applyFilters, 200);
    });
  }

  const filterType = document.getElementById('filter-type');
  if (filterType) {
    filterType.addEventListener('change', applyFilters);
  }

  const filterPriority = document.getElementById('filter-priority');
  if (filterPriority) {
    filterPriority.addEventListener('change', applyFilters);
  }

  const filterAssignee = document.getElementById('filter-assignee');
  if (filterAssignee) {
    filterAssignee.addEventListener('change', applyFilters);
  }
}
