// ===== Bulk Actions Module =====
function initBulkActions() {
  document.getElementById('bulk-status').addEventListener('change', handleBulkStatusChange);
  document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
  document.getElementById('bulk-clear').addEventListener('click', handleBulkClear);
  document.getElementById('bulk-priority').addEventListener('change', e => {
    const priority = e.target.value;
    if (!priority) return;
    getIssues().forEach(i => {
      if (selectedIds.has(i.id)) {
        trackHistory(i, 'priority', i.priority, priority);
        i.priority = priority;
      }
    });
    saveStateDebounced();
    renderBoard();
    updateCounts();
    e.target.value = '';
  });
  document.getElementById('bulk-assignee').addEventListener('change', e => {
    const assignee = e.target.value;
    if (!assignee) return;
    getIssues().forEach(i => {
      if (selectedIds.has(i.id)) {
        trackHistory(i, 'assignee', i.assignee || '', assignee);
        i.assignee = assignee;
      }
    });
    saveStateDebounced();
    renderBoard();
    updateCounts();
    e.target.value = '';
  });
}

