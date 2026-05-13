// ===== Sprint Management Module =====
function initSprints() {
  // Manage sprints button
  document.getElementById('manage-sprints-btn').addEventListener('click', () => {
    document.getElementById('sprint-modal-overlay').style.display = 'flex';
    renderSprintList();
  });
  document.getElementById('sprint-modal-close').addEventListener('click', () => {
    document.getElementById('sprint-modal-overlay').style.display = 'none';
  });
  document.getElementById('sprint-modal-overlay').addEventListener('click', e => {
    if (!e.target.closest('.modal')) {
      document.getElementById('sprint-modal-overlay').style.display = 'none';
    }
  });
  document.getElementById('sprint-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('sprint-name').value.trim();
    const start = document.getElementById('sprint-start').value;
    const end = document.getElementById('sprint-end').value;
    if (!name || !start || !end) return;
    createSprint(name, start, end);
    document.getElementById('sprint-name').value = '';
    document.getElementById('sprint-start').value = '';
    document.getElementById('sprint-end').value = '';
    renderSprintList();
    populateSprintFilter();
    populateSprintSelect();
    updateSprintBar();
    // Show sprint bar if active sprint now exists
    const newActive = getActiveSprint();
    if (newActive) {
      const sprintBar = document.getElementById('sprint-bar');
      if (sprintBar) {
        sprintBar.style.display = 'block';
        document.getElementById('sprint-bar-name').textContent = newActive.name;
        updateSprintProgressBar(newActive);
      }
    }
    showToast('Sprint created', 'success');
  });
}

