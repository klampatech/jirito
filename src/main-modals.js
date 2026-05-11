// ===== Modal Helpers Module =====
function openModal(status) {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('issue-status').value = status || 'todo';
  document.getElementById('issue-title').focus();
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('issue-form').reset();
}

function initModals() {
  document.getElementById('add-issue-btn').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (!e.target.closest('.modal')) closeModal();
  });

  document.getElementById('issue-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('issue-title').value.trim();
    // Check for duplicates
    const duplicates = findDuplicateIssues(title);
    if (duplicates.length > 0) {
      const dupKeys = duplicates.map(d => generateIssueKey(getProjectKey(), d.id)).join(', ');
      if (!confirm(`Similar issue(s) found: ${dupKeys}. Create anyway?`)) {
        return;
      }
    }
    setIssueCounter(getIssueCounter() + 1);
    const newIssue = {
      id: getIssueCounter(),
      title: title,
      desc: document.getElementById('issue-desc').value.trim(),
      type: document.getElementById('issue-type').value,
      priority: document.getElementById('issue-priority').value,
      assignee: document.getElementById('issue-assignee').value.trim(),
      status: 'todo',
      dueDate: document.getElementById('issue-due-date').value || null,
      labels: [],
      storyPoints: document.getElementById('issue-story-points').value ? parseInt(document.getElementById('issue-story-points').value) : null,
      sprint: document.getElementById('issue-sprint').value || null,
      rank: getIssues().length,
      history: [],
    };
    getIssues().push(newIssue);
    saveState();
    renderBoard();
    closeModal();
    addActivity('PlusCircle', `Created <strong>${generateIssueKey(getProjectKey(), newIssue.id)}</strong>`);
    showUndoToast(`Created ${generateIssueKey(getProjectKey(), newIssue.id)}`, () => {
      const idx = getIssues().findIndex(i => i.id === newIssue.id);
      if (idx !== -1) {
        getIssues().splice(idx, 1);
        delete getComments()[newIssue.id];
        saveState();
        renderBoard();
        updateCounts();
        renderTrash();
      }
      removeUndoToast();
      showToast('Issue deleted', 'success');
    });
  });

  // Live duplicate detection on title input
  document.getElementById('issue-title').addEventListener('input', () => {
    const title = document.getElementById('issue-title').value.trim();
    const existingWarning = document.getElementById('duplicate-warning');
    if (existingWarning) existingWarning.remove();
    if (title.length < 3) return;
    const duplicates = findDuplicateIssues(title);
    if (duplicates.length > 0) {
      const dupKeys = duplicates.map(d => generateIssueKey(getProjectKey(), d.id)).join(', ');
      const warning = document.createElement('div');
      warning.id = 'duplicate-warning';
      warning.style.cssText = 'color:var(--warning);font-size:12px;margin-top:4px;padding:6px 8px;background:var(--warning-bg);border-radius:4px;';
      warning.textContent = `⚠ Similar issue(s): ${dupKeys}`;
      document.getElementById('issue-title').parentElement.appendChild(warning);
    }
  });

  // Add card buttons
  document.querySelectorAll('.btn-add-card').forEach(btn => {
    btn.addEventListener('click', () => openModal());
  });
}

