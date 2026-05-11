// ===== Project Management Module =====
function initProjects() {
  // New project button
  document.getElementById('add-project-btn').addEventListener('click', () => {
    document.getElementById('project-modal-overlay').style.display = 'flex';
    document.getElementById('project-name').focus();
  });
  document.getElementById('project-modal-close').addEventListener('click', () => {
    document.getElementById('project-modal-overlay').style.display = 'none';
    document.getElementById('project-form').reset();
  });
  document.getElementById('project-cancel').addEventListener('click', () => {
    document.getElementById('project-modal-overlay').style.display = 'none';
    document.getElementById('project-form').reset();
  });
  document.getElementById('project-modal-overlay').addEventListener('click', e => {
    if (!e.target.closest('.modal')) {
      document.getElementById('project-modal-overlay').style.display = 'none';
      document.getElementById('project-form').reset();
    }
  });
  document.getElementById('project-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('project-name').value.trim();
    const key = document.getElementById('project-key').value.trim().toUpperCase();
    if (!name || !key) return;
    if (getProjects()[key]) { showToast('Project key already exists!', 'error'); return; }
    createProject(name, key);
    document.getElementById('project-modal-overlay').style.display = 'none';
    document.getElementById('project-form').reset();
  });
}

