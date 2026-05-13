// ===== Project & Column Management Module =====
// Handles: project creation modal, column config, export/import, bulk actions

let _importInput = null;

function getImportInput() {
  if (!_importInput) {
    _importInput = document.createElement('input');
    _importInput.type = 'file';
    _importInput.accept = '.json';
    _importInput.style.display = 'none';
    document.body.appendChild(_importInput);
  }
  return _importInput;
}

function initProjects() {
  // Export / Import
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }

  const importBtn = document.getElementById('import-btn');
  if (importBtn) {
    importBtn.addEventListener('click', () => getImportInput().click());
  }

  getImportInput().addEventListener('change', e => {
    if (e.target.files[0]) {
      importData(e.target.files[0]);
      e.target.value = '';
    }
  });

  // New project button
  const addProjectBtn = document.getElementById('add-project-btn');
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
      document.getElementById('project-modal-overlay').style.display = 'flex';
      document.getElementById('project-name').focus();
    });
  }

  const projectModalClose = document.getElementById('project-modal-close');
  if (projectModalClose) {
    projectModalClose.addEventListener('click', () => {
      document.getElementById('project-modal-overlay').style.display = 'none';
      document.getElementById('project-form').reset();
    });
  }

  const projectCancel = document.getElementById('project-cancel');
  if (projectCancel) {
    projectCancel.addEventListener('click', () => {
      document.getElementById('project-modal-overlay').style.display = 'none';
      document.getElementById('project-form').reset();
    });
  }

  const projectOverlay = document.getElementById('project-modal-overlay');
  if (projectOverlay) {
    projectOverlay.addEventListener('click', e => {
      if (!e.target.closest('.modal')) {
        document.getElementById('project-modal-overlay').style.display = 'none';
        document.getElementById('project-form').reset();
      }
    });
  }

  const projectForm = document.getElementById('project-form');
  if (projectForm) {
    projectForm.addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('project-name').value.trim();
      const key = document.getElementById('project-key').value.trim().toUpperCase();
      if (!name || !key) return;
      if (getProjects()[key]) {
        showToast('Project key already exists!', 'error');
        return;
      }
      createProject(name, key);
      document.getElementById('project-modal-overlay').style.display = 'none';
      document.getElementById('project-form').reset();
    });
  }

  // Save filter button
  const saveFilterBtn = document.getElementById('save-filter-btn');
  if (saveFilterBtn) {
    saveFilterBtn.addEventListener('click', saveCurrentFilter);
  }

  // Column config button
  const columnConfigBtn = document.getElementById('column-config-btn');
  if (columnConfigBtn) {
    columnConfigBtn.addEventListener('click', () => {
      document.getElementById('column-config-overlay').style.display = 'flex';
      renderColumnConfig();
    });
  }

  const columnConfigClose = document.getElementById('column-config-close');
  if (columnConfigClose) {
    columnConfigClose.addEventListener('click', () => {
      document.getElementById('column-config-overlay').style.display = 'none';
    });
  }

  const columnConfigOverlay = document.getElementById('column-config-overlay');
  if (columnConfigOverlay) {
    columnConfigOverlay.addEventListener('click', e => {
      if (!e.target.closest('.modal')) {
        document.getElementById('column-config-overlay').style.display = 'none';
      }
    });
  }

  // Reset columns to defaults
  const resetColumnsBtn = document.getElementById('reset-columns-btn');
  if (resetColumnsBtn) {
    resetColumnsBtn.addEventListener('click', () => {
      if (confirm('Reset columns to defaults? Custom columns will be removed.')) {
        delete getCustomColumns()[getCurrentProject()];
        saveState();
        renderColumnConfig();
        renderBoard();
        showToast('Columns reset to defaults', 'success');
      }
    });
  }

  const addColumnBtn = document.getElementById('add-column-btn');
  if (addColumnBtn) {
    addColumnBtn.addEventListener('click', () => {
      const name = document.getElementById('new-column-name').value.trim();
      const color = document.getElementById('new-column-color').value;
      const status = document.getElementById('new-column-status').value;
      if (!name) return;
      const id = addCustomColumn(name, color);
      if (status) {
        updateCustomColumn(id, { status });
      }
      document.getElementById('new-column-name').value = '';
      renderColumnConfig();
      renderBoard();
      showToast('Column added', 'success');
    });
  }

  // Bulk action listeners
  const bulkStatus = document.getElementById('bulk-status');
  if (bulkStatus) {
    bulkStatus.addEventListener('change', handleBulkStatusChange);
  }

  const bulkDelete = document.getElementById('bulk-delete');
  if (bulkDelete) {
    bulkDelete.addEventListener('click', handleBulkDelete);
  }

  const bulkClear = document.getElementById('bulk-clear');
  if (bulkClear) {
    bulkClear.addEventListener('click', handleBulkClear);
  }

  const bulkPriority = document.getElementById('bulk-priority');
  if (bulkPriority) {
    bulkPriority.addEventListener('change', e => {
      const priority = e.target.value;
      if (!priority) return;
      getIssues().forEach(i => {
        if (selectedIds.has(i.id)) {
          trackHistory(i, 'priority', i.priority, priority);
          i.priority = priority;
        }
      });
      saveState();
      renderBoard();
      updateCounts();
      e.target.value = '';
    });
  }

  const bulkAssignee = document.getElementById('bulk-assignee');
  if (bulkAssignee) {
    bulkAssignee.addEventListener('change', e => {
      const assignee = e.target.value;
      if (!assignee) return;
      getIssues().forEach(i => {
        if (selectedIds.has(i.id)) {
          trackHistory(i, 'assignee', i.assignee || '', assignee);
          i.assignee = assignee;
        }
      });
      saveState();
      renderBoard();
      updateCounts();
      e.target.value = '';
    });
  }
}
