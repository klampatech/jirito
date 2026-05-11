// ===== Column Configuration Module =====
function initColumnConfig() {
  document.getElementById('column-config-btn').addEventListener('click', () => {
    document.getElementById('column-config-overlay').style.display = 'flex';
    renderColumnConfig();
  });
  document.getElementById('column-config-close').addEventListener('click', () => {
    document.getElementById('column-config-overlay').style.display = 'none';
  });
  document.getElementById('column-config-overlay').addEventListener('click', e => {
    if (!e.target.closest('.modal')) {
      document.getElementById('column-config-overlay').style.display = 'none';
    }
  });
  // Reset columns to defaults
  document.getElementById('reset-columns-btn').addEventListener('click', () => {
    if (confirm('Reset columns to defaults? Custom columns will be removed.')) {
      delete getCustomColumns()[getCurrentProject()];
      saveState();
      renderColumnConfig();
      renderBoard();
      showToast('Columns reset to defaults', 'success');
    }
  });
  document.getElementById('add-column-btn').addEventListener('click', () => {
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

