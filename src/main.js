// ===== Main Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Task 2.2: Use consolidated initializeData() instead of inline migration
  initializeData();

  renderSidebar();
  renderBoard();
  initDragDrop();
  populateAssigneeFilter();
  updateSprintBar();
  populateSprintSelect();
  // Show sprint bar if active sprint exists
  const activeSprint = getActiveSprint();
  if (activeSprint) {
    const sprintBar = document.getElementById('sprint-bar');
    if (sprintBar) {
      sprintBar.style.display = 'block';
      document.getElementById('sprint-bar-name').textContent = activeSprint.name;
      updateSprintProgressBar(activeSprint);
    }
  }
  // Update nav project name to match current project
  const navName = document.getElementById('nav-project-name');
  if (navName && LJ.projects[LJ.currentProject]) {
    navName.textContent = LJ.projects[LJ.currentProject].name;
  }
  // Update board title to show project name
  const boardTitle = document.getElementById('board-title');
  if (boardTitle && LJ.projects[LJ.currentProject]) {
    boardTitle.textContent = `${LJ.projects[LJ.currentProject].icon} ${LJ.projects[LJ.currentProject].name} — Board`;
  }

  // Bulk action listeners
  document.getElementById('bulk-status').addEventListener('change', handleBulkStatusChange);
  document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
  document.getElementById('bulk-clear').addEventListener('click', handleBulkClear);
  document.getElementById('bulk-priority').addEventListener('change', e => {
    const priority = e.target.value;
    if (!priority) return;
    LJ.issues.forEach(i => {
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
    LJ.issues.forEach(i => {
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

  // Export / Import
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

  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const wrapper = document.getElementById('sidebar-wrapper');
    const toggle = document.getElementById('sidebar-toggle');
    const isCollapsed = wrapper.classList.toggle('collapsed');
    // Move toggle button position: at sidebar edge when open, at screen left when collapsed
    if (isCollapsed) {
      toggle.style.left = '0';
    } else {
      toggle.style.left = '260px';
    }
  });

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
    if (LJ.projects[key]) { showToast('Project key already exists!', 'error'); return; }
    createProject(name, key);
    document.getElementById('project-modal-overlay').style.display = 'none';
    document.getElementById('project-form').reset();
  });

  // Save filter button
  document.getElementById('save-filter-btn').addEventListener('click', saveCurrentFilter);

  // Column config button
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
      delete LJ.customColumns[LJ.currentProject];
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

  // Sprint filter
  const sprintFilter = document.getElementById('sprint-filter');
  if (sprintFilter) {
    sprintFilter.addEventListener('change', () => {
      applyFilters();
      renderBoard();
    });
  }

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
    LJ.issueCounter++;
    const newIssue = {
      id: LJ.issueCounter,
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
      rank: LJ.issues.length,
      history: [],
    };
    LJ.issues.push(newIssue);
    saveState();
    renderBoard();
    closeModal();
    addActivity('PlusCircle', `Created <strong>${generateIssueKey(getProjectKey(), newIssue.id)}</strong>`);
    showUndoToast(`Created ${generateIssueKey(getProjectKey(), newIssue.id)}`, () => {
      const idx = LJ.issues.findIndex(i => i.id === newIssue.id);
      if (idx !== -1) {
        LJ.issues.splice(idx, 1);
        delete LJ.comments[newIssue.id];
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

  // Column "..." menu buttons
  document.querySelectorAll('.column-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const column = btn.closest('.column');
      const colId = column.dataset.colId;
      const colDef = getEffectiveColumns().find(c => c.id === colId);
      const status = colDef?.status || column.dataset.status;
      const labels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
      const isCustom = !colDef?.status;
      const menu = document.createElement('div');
      menu.className = 'column-menu';
      menu.style.cssText = `position:absolute;top:36px;right:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.12);z-index:60;min-width:180px;padding:4px 0;`;
      menu.innerHTML = `
        <button class="column-menu-item" data-action="rename" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;">
          ${lucideIcon('Pencil', {class:'icon-sm'})} Rename column
        </button>
        <button class="column-menu-item" data-action="add-card" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;">
          ${lucideIcon('Plus', {class:'icon-sm'})} Add card
        </button>
        ${isCustom ? '' : `<button class="column-menu-item" data-action="clear-status" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--danger);cursor:pointer;">
          ${lucideIcon('Trash', {class:'icon-sm'})} Clear all cards
        </button>`}
        ${isCustom ? '' : `<hr style="border:none;border-top:1px solid var(--border-light);margin:4px 0;">`}
        <button class="column-menu-item" data-action="close" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text-muted);cursor:pointer;">
          ${lucideIcon('X', {class:'icon-sm'})} Close
        </button>
      `;
      const header = btn.closest('.column-header');
      header.style.position = 'relative';
      header.appendChild(menu);

      const closeMenu = (ev) => {
        if (!header.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      document.addEventListener('click', closeMenu);

      menu.querySelectorAll('.column-menu-item').forEach(item => {
        item.addEventListener('click', () => {
          const action = item.dataset.action;
          if (action === 'close' || action === 'rename' || action === 'add-card' || action === 'clear-status') {
            menu.remove();
          }
          if (action === 'rename') {
            const newName = prompt('Rename column:', colDef?.name || status);
            if (newName && newName.trim()) {
              const titleSpan = column.querySelector('.column-title span:nth-child(2)');
              titleSpan.textContent = newName.trim();
              if (colDef) {
                updateCustomColumn(colId, { name: newName.trim() });
              }
              addActivity('Pencil', `Renamed column to <strong>${escapeHtml(newName.trim())}</strong>`);
            }
          }
          if (action === 'add-card') {
            openModal();
          }
          if (action === 'clear-status' && status) {
            const count = LJ.issues.filter(i => i.status === status).length;
            if (count === 0) return;
            if (confirm(`Delete all ${count} cards in this column?`)) {
              const clearedIssues = LJ.issues.filter(i => i.status === status);
              LJ.issues = LJ.issues.filter(i => i.status !== status);
              saveState();
              renderBoard();
              updateCounts();
              addActivity('Trash', `Cleared ${count} cards from <strong>${labels[status]}</strong>`);
              showUndoToast(`${count} cards cleared`, () => {
                clearedIssues.forEach(i => LJ.issues.push(i));
                saveState();
                renderBoard();
                updateCounts();
                removeUndoToast();
                showToast('Cards restored', 'success');
              });
            }
          }
        });
      });
    });
  });

  // Detail panel close
  document.getElementById('detail-close').addEventListener('click', closeDetailPanel);
  // Detail panel backdrop close
  document.getElementById('detail-backdrop').addEventListener('click', closeDetailPanel);

  // Filter controls
  // Task 2.3: Debounce search input
  let filterTimeout;
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(applyFilters, 200);
  });
  document.getElementById('filter-type').addEventListener('change', applyFilters);
  document.getElementById('filter-priority').addEventListener('change', applyFilters);
  document.getElementById('filter-assignee').addEventListener('change', applyFilters);

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const panel = document.getElementById('detail-panel');
      if (panel.classList.contains('open')) { closeDetailPanel(); return; }
      const modal = document.getElementById('modal-overlay');
      if (modal.style.display === 'flex') { closeModal(); return; }
      const projectModal = document.getElementById('project-modal-overlay');
      if (projectModal.style.display === 'flex') { projectModal.style.display = 'none'; return; }
      const onboarding = document.getElementById('onboarding-overlay');
      if (onboarding.style.display === 'flex') { onboarding.style.display = 'none'; return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openModal();
    }
    // Ctrl+Z / Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (currentUndoCallback) {
        currentUndoCallback();
        removeUndoToast();
      }
    }
    // Arrow key navigation for cards
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.ctrlKey && !e.metaKey) {
      const active = document.activeElement;
      if (active && active.classList.contains('issue-card')) {
        e.preventDefault();
        const column = active.closest('.column-body');
        const cards = [...column.querySelectorAll('.issue-card:not(.dragging)')];
        const idx = cards.indexOf(active);
        let nextIdx;
        if (e.key === 'ArrowDown') {
          nextIdx = Math.min(idx + 1, cards.length - 1);
        } else {
          nextIdx = Math.max(idx - 1, 0);
        }
        if (nextIdx !== idx) {
          cards[nextIdx].focus();
        }
      }
    }
  });

  // Notification bell dropdown
  const bell = document.getElementById('notification-bell');
  const dropdown = document.getElementById('notification-dropdown');
  if (bell) {
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
      } else {
        updateNotificationDropdown();
        dropdown.style.display = 'block';
        // Position dropdown under the bell icon using fixed positioning
        const bellRect = bell.getBoundingClientRect();
        dropdown.style.top = (bellRect.bottom + 4) + 'px';
        dropdown.style.right = (window.innerWidth - bellRect.right) + 'px';
        dropdown.style.left = 'auto';
      }
    });
  }
  document.addEventListener('click', (e) => {
    if (dropdown && !bell.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Task 1.4: Fix onboarding visibility — show on first load regardless of data
  checkOnboarding();

  // Initialize calendar
  initCalendar();

  // Render trash
  renderTrash();

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('jirito-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.innerHTML = savedTheme === 'dark' ? lucideIcon('Sun', {class:'icon'}) : lucideIcon('Moon', {class:'icon'});
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.innerHTML = lucideIcon('Sun', {class:'icon'});
  }
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jirito-theme', next);
    themeToggle.innerHTML = next === 'dark' ? lucideIcon('Sun', {class:'icon'}) : lucideIcon('Moon', {class:'icon'});
  });
});

// ===== Notification Dropdown =====
function updateNotificationDropdown() {
  const body = document.getElementById('notification-dropdown-body');
  if (!body) return;
  const overdue = LJ.issues.filter(i => isOverdue(i.dueDate, i.status));
  if (overdue.length === 0) {
    body.innerHTML = '<div class="notification-empty">No overdue issues</div>';
    return;
  }
  body.innerHTML = overdue.map(i => `
    <div class="notification-item" data-id="${i.id}">
      <span class="notification-key">${generateIssueKey(getProjectKey(), i.id)}</span>
      <span class="notification-title">${escapeHtml(i.title)}</span>
      <span class="notification-date">Due: ${formatDate(i.dueDate)}</span>
    </div>
  `).join('');
  body.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', () => {
      openDetailPanel(parseInt(item.dataset.id));
      document.getElementById('notification-dropdown').style.display = 'none';
    });
  });
}

// ===== Trash =====
function renderTrash() {
  const section = document.getElementById('trash-section');
  const list = document.getElementById('trash-list');
  const count = document.getElementById('trash-count');
  if (!section || !list || !count) return;

  if (LJ.trash.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  count.textContent = `(${LJ.trash.length})`;
  list.innerHTML = LJ.trash.map((t, idx) => `
    <div class="trash-item">
      <span class="trash-item-title">${t.issues.map(i => escapeHtml(i.title)).join(', ')}</span>
      <button class="trash-restore" data-idx="${idx}">Restore</button>
    </div>
  `).join('');
  list.querySelectorAll('.trash-restore').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      restoreFromTrash(idx);
      renderTrash();
      showToast('Issue restored', 'success');
    });
  });
}

// ===== Onboarding =====
function checkOnboarding() {
  const seen = localStorage.getItem('jirito-onboarding');
  if (seen) return;
  // Task 1.4: Removed the hasData check — show onboarding on first load always
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  let currentStep = 1;
  const totalSteps = 4;

  function updateStep(step) {
    document.querySelectorAll('.onboarding-step').forEach(s => s.style.display = 'none');
    document.querySelector(`.onboarding-step[data-step="${step}"]`).style.display = 'block';
    const nextBtn = document.getElementById('onboarding-next');
    nextBtn.textContent = step === totalSteps ? 'Get Started' : 'Next';
  }

  updateStep(1);

  document.getElementById('onboarding-next').addEventListener('click', () => {
    if (currentStep < totalSteps) {
      currentStep++;
      updateStep(currentStep);
    } else {
      overlay.style.display = 'none';
      localStorage.setItem('jirito-onboarding', 'true');
    }
  });

  document.getElementById('onboarding-skip').addEventListener('click', () => {
    overlay.style.display = 'none';
    localStorage.setItem('jirito-onboarding', 'true');
  });
}

// ===== Modal helpers =====
function openModal() {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('issue-title').focus();
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('issue-form').reset();
}
