// ===== Export / Import Module =====
function initExportImport() {
  document.getElementById('export-btn').addEventListener('click', exportData);
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json';
  importInput.style.display = 'none';
  document.body.appendChild(importInput);
  document.getElementById('import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', e => {
    if (e.target.files[0]) {
      importData(e.target.files[0]);
      e.target.value = '';
    }
  });
}

