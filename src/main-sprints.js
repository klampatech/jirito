// ===== Sprint Management Module =====
// Handles: sprint modal, sprint filter, sprint bar display

function initSprints() {
  // Sprint filter
  const sprintFilter = document.getElementById('sprint-filter');
  if (sprintFilter) {
    sprintFilter.addEventListener('change', () => {
      applyFilters();
      renderBoard();
    });
  }

  // Manage sprints button
  const manageSprintsBtn = document.getElementById('manage-sprints-btn');
  if (manageSprintsBtn) {
    manageSprintsBtn.addEventListener('click', () => {
      document.getElementById('sprint-modal-overlay').style.display = 'flex';
      renderSprintList();
    });
  }

  const sprintModalClose = document.getElementById('sprint-modal-close');
  if (sprintModalClose) {
    sprintModalClose.addEventListener('click', () => {
      document.getElementById('sprint-modal-overlay').style.display = 'none';
    });
  }

  const sprintModalOverlay = document.getElementById('sprint-modal-overlay');
  if (sprintModalOverlay) {
    sprintModalOverlay.addEventListener('click', e => {
      if (!e.target.closest('.modal')) {
        document.getElementById('sprint-modal-overlay').style.display = 'none';
      }
    });
  }

  const sprintForm = document.getElementById('sprint-form');
  if (sprintForm) {
    sprintForm.addEventListener('submit', e => {
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
}
