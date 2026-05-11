// ===== Filter Controls Module =====
function initFilterControls() {
  // Sprint filter
  const sprintFilter = document.getElementById('sprint-filter');
  if (sprintFilter) {
    sprintFilter.addEventListener('change', () => {
      applyFilters();
      renderBoard();
    });
  }

  // Filter controls
  let filterTimeout;
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(applyFilters, 200);
  });
  document.getElementById('filter-type').addEventListener('change', applyFilters);
  document.getElementById('filter-priority').addEventListener('change', applyFilters);
  document.getElementById('filter-assignee').addEventListener('change', applyFilters);
}

