// ===== Rendering =====

function renderBoard() {
  const columns = getEffectiveColumns();
  const board = document.getElementById('board');
  const existingCols = board.querySelectorAll('.column');

  // Remove columns that no longer exist
  existingCols.forEach(col => {
    const colStatus = col.dataset.status;
    const colId = col.dataset.colId;
    const colDef = columns.find(c => c.id === colId);
    if (!colDef) {
      col.remove();
      return;
    }
    // Update column header if name changed
    const titleSpan = col.querySelector('.column-title span:nth-child(2)');
    if (titleSpan && titleSpan.textContent !== colDef.name) {
      titleSpan.textContent = colDef.name;
    }
    // Update border color
    if (colDef.color) {
      col.style.borderTopColor = colDef.color;
    }
  });

  // Create or update columns
  columns.forEach(colDef => {
    let col = board.querySelector(`.column[data-col-id="${colDef.id}"]`);
    if (!col) {
      col = document.createElement('div');
      col.className = 'column';
      col.dataset.status = colDef.status || colDef.id;
      col.dataset.colId = colDef.id;
      col.style.borderTopColor = colDef.color || '#9E9E9E';
      col.innerHTML = `
        <div class="column-header">
          <div class="column-title">
            <span class="status-dot" style="background:${colDef.color}"></span>
            <span>${escapeHtml(colDef.name)}</span>
            <span class="count" data-count-for="${colDef.id}">0</span>
          </div>
          <button class="btn-icon column-menu-btn" data-col-id="${colDef.id}">⋯</button>
        </div>
        <div class="column-body" data-status="${colDef.status || colDef.id}" data-col-id="${colDef.id}" role="list" aria-label="${escapeHtml(colDef.name)} column"></div>
        <div class="column-footer">
          <button class="btn-add-card" data-status="${colDef.status || colDef.id}">+ Add card</button>
        </div>
      `;
      board.appendChild(col);
      // Re-init drag drop for new column
      initDragDrop();
    }

    // Render cards in column
    const colBody = col.querySelector('.column-body');
    colBody.innerHTML = '';
    let colIssues = getIssues().filter(i => {
      if (colDef.status) return i.status === colDef.status;
      // For custom columns without status mapping, show all (they're custom)
      return false;
    });
    // Apply sprint filter
    const sprintFilter = document.getElementById('sprint-filter')?.value || 'all';
    if (sprintFilter !== 'all') {
      colIssues = colIssues.filter(i => i.sprint === sprintFilter);
    }
    // Sort by rank (custom ordering)
    colIssues.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    colIssues.forEach(issue => {
      colBody.appendChild(createCard(issue));
    });

    // Update count
    const countEl = col.querySelector(`[data-count-for="${colDef.id}"]`);
    if (countEl) countEl.textContent = colIssues.length;
  });

  updateCounts();
  updateSprintProgress();
}

function createCard(issue) {
  const card = document.createElement('div');
  card.className = 'issue-card';
  card.draggable = true;
  card.dataset.id = issue.id;
  card.dataset.type = issue.type;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${generateIssueKey(getProjectKey(), issue.id)}: ${escapeHtml(issue.title)}`);

  const commentCount = (getComments()[issue.id] || []).length;
  const projectKey = getProjectKey();
  const key = generateIssueKey(projectKey, issue.id);
  const deps = getDependencies(issue.id);
  const dependents = getDependents(issue.id);

  let labelsHtml = '';
  if (issue.labels && issue.labels.length > 0) {
    labelsHtml = `<div class="issue-labels">${issue.labels.map(l => `<span class="issue-label">${escapeHtml(l)}</span>`).join('')}</div>`;
  }

  // Sprint badge
  let sprintBadge = '';
  if (issue.sprint) {
    const sprints = getSprints();
    const sprint = sprints[issue.sprint];
    if (sprint) {
      sprintBadge = `<span class="issue-sprint-badge" title="${escapeHtml(sprint.name)}">${lucideIcon('Lightning', {class:'icon-sm'})} ${escapeHtml(sprint.name)}</span>`;
    }
  }

  // Dependency indicators
  let depIndicators = '';
  if (dependents.length > 0) {
    depIndicators = `<span class="issue-dep-badge" title="${dependents.length} issue(s) depend on this">${lucideIcon('Link', {class:'icon-sm'})} ${dependents.length}</span>`;
  }
  if (deps.length > 0) {
    depIndicators += `<span class="issue-dep-badge" title="${deps.length} dependency">${lucideIcon('Link', {class:'icon-sm'})} ${deps.length}</span>`;
  }

  card.innerHTML = `
    <div class="issue-card-header">
      <input type="checkbox" class="issue-checkbox" data-id="${issue.id}" onclick="event.stopPropagation()">
      <span class="issue-key">${key}</span>
      <span class="issue-type-icon">${lucideIcon(typeIcons[issue.type] || 'File', {class:'icon'})}</span>
      ${depIndicators ? `<span class="issue-dep-indicators">${depIndicators}</span>` : ''}
    </div>
    ${labelsHtml}
    ${sprintBadge ? `<div class="issue-sprint-row">${sprintBadge}</div>` : ''}
    <div class="issue-title">${escapeHtml(issue.title)}</div>
    ${issue.desc ? `<div class="issue-desc">${escapeHtml(issue.desc)}</div>` : ''}
    <div class="issue-card-footer">
      <span class="issue-priority priority-${escapeHtml(issue.priority)}">${escapeHtml(issue.priority)}</span>
      ${issue.storyPoints ? `<span class="issue-sp-badge" title="Story Points">${lucideIcon('Target', {class:'icon-sm'})} ${issue.storyPoints}</span>` : ''}
      ${issue.dueDate ? `<span class="issue-due-date ${isOverdue(issue.dueDate, issue.status) ? 'overdue' : ''}">${lucideIcon('Calendar', {class:'icon-sm'})} ${formatDate(issue.dueDate)}</span>` : ''}
      <div style="display:flex;align-items:center;gap:8px;">
        ${commentCount > 0 ? `<span class="issue-comments-badge">${lucideIcon('Chat', {class:'icon-sm'})} ${commentCount}</span>` : ''}
        ${issue.assignee ? `<div class="issue-assignee" title="${escapeHtml(issue.assignee)}">${issue.assignee.charAt(0).toUpperCase()}</div>` : ''}
      </div>
    </div>
  `;

  // Click to open detail panel (delegated via column-body)
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${generateIssueKey(getProjectKey(), issue.id)}: ${escapeHtml(issue.title)}`);

  // Keyboard support
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetailPanel(issue.id);
    }
  });

  // Checkbox for bulk actions
  const checkbox = card.querySelector('.issue-checkbox');
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) getSelectedIds().add(issue.id);
    else getSelectedIds().delete(issue.id);
    updateBulkBar();
  });

  // Drag events
  card.addEventListener('dragstart', e => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(issue.id));
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}

function updateCounts() {
  const columns = getEffectiveColumns();
  columns.forEach(colDef => {
    const countEl = document.querySelector(`[data-count-for="${colDef.id}"]`);
    if (countEl) {
      const status = colDef.status;
      if (status) {
        countEl.textContent = getIssues().filter(i => i.status === status).length;
      } else {
        countEl.textContent = '—';
      }
    }
  });
  updateNotifications();
}

// ===== Notifications =====
function updateNotifications() {
  const bell = document.getElementById('notification-bell');
  const countEl = document.getElementById('notification-count');
  if (!bell || !countEl) return;
  const overdue = getIssues().filter(i => isOverdue(i.dueDate, i.status));
  if (overdue.length > 0) {
    countEl.textContent = overdue.length;
    countEl.style.display = 'flex';
    bell.title = `${overdue.length} overdue issue${overdue.length > 1 ? 's' : ''}: ${overdue.map(i => escapeHtml(i.title)).join(', ')}`;
  } else {
    countEl.style.display = 'none';
    bell.title = 'No notifications';
  }
}

// ===== Sidebar Rendering =====
function renderSidebar() {
  renderProjects();
  renderViews();
  renderSavedFilters();
  renderActivity();
}

// ===== Inline Project Rename =====
function startInlineRename(key, itemEl) {
  const proj = getProjects()[key];
  if (!proj) return;

  const nameSpan = itemEl.querySelector('.project-name');
  const currentName = proj.name;

  // Replace the name span with an input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-rename-input';
  input.value = currentName;
  input.maxLength = 50;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finishRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      proj.name = newName;
      saveState();
      addActivity('Pencil', `Renamed project to <strong>${escapeHtml(newName)}</strong>`);
      showToast('Project renamed', 'success');
    }
    // Re-render to restore the name span
    renderProjects();
    // Update nav project name if this is the current project
    if (getCurrentProject() === key) {
      const navName = document.getElementById('nav-project-name');
      if (navName) navName.textContent = getProjects()[key].name;
    }
  };

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });
}

function renderProjects() {
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  Object.entries(getProjects()).forEach(([key, proj]) => {
    const item = document.createElement('div');
    item.className = `project-item${key === getCurrentProject() ? ' active' : ''}`;
    item.dataset.key = key;
    item.innerHTML = `
      <span class="project-icon">${proj.icon}</span>
      <span class="project-key">${proj.key ? proj.key.toUpperCase() : key.toUpperCase()}</span>
      <span class="project-name" title="Click to rename">${escapeHtml(proj.name)}</span>
      <button class="project-delete" data-key="${key}" title="Delete project">✕</button>
    `;
    item.addEventListener('click', e => {
      // Don't switch project when clicking the delete button
      if (e.target.closest('.project-delete')) return;
      // If clicking the project name and the project is already selected, trigger inline rename
      const nameTarget = e.target.closest('.project-name');
      if (nameTarget && key === getCurrentProject()) {
        e.stopPropagation();
        startInlineRename(key, item);
        return;
      }
      switchProject(key);
    });
    item.querySelector('.project-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteProject(key);
    });
    list.appendChild(item);
  });
}

function renderViews() {
  const list = document.getElementById('view-list');
  list.innerHTML = '';
  const views = [
    { id: 'board', icon: 'Layout', label: 'Board' },
    { id: 'list', icon: 'List', label: 'List' },
    { id: 'calendar', icon: 'Calendar', label: 'Calendar' },
    { id: 'dashboard', icon: 'ChartBar', label: 'Dashboard' },
  ];
  views.forEach(v => {
    const item = document.createElement('div');
    item.className = `view-item${v.id === getCurrentView() ? ' active' : ''}`;
    item.innerHTML = `<span class="view-icon">${lucideIcon(v.icon, {class:'icon'})}</span><span>${v.label}</span>`;
    item.addEventListener('click', () => switchView(v.id));
    list.appendChild(item);
  });
  // Re-render Phosphor icons in the view list
}

// ===== Column Configuration =====
function renderColumnConfig() {
  const container = document.getElementById('column-config-list');
  if (!container) return;
  const columns = getEffectiveColumns();

  container.innerHTML = columns.map((col, idx) => {
    const isDefault = getDefaultColumns().some(d => d.id === col.id);
    const cardCount = col.status ? getIssues().filter(i => i.status === col.status).length : 0;
    const statusOptions = ['todo', 'inprogress', 'review', 'done'].map(s => {
      const labels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
      return `<option value="${s}" ${col.status === s ? 'selected' : ''}>${labels[s]}</option>`;
    }).join('');
    return `<div class="column-config-item" data-col-id="${col.id}" draggable="true" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border:1px solid var(--border);border-radius:6px;background:var(--bg-page);cursor:grab;">
      <span class="column-drag-handle" style="color:var(--text-muted);cursor:grab;">⋮⋮</span>
      <input type="color" value="${col.color}" class="column-config-color" data-col-id="${col.id}" style="width:32px;height:28px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:1px;">
      <input type="text" value="${escapeHtml(col.name)}" class="column-config-name" data-col-id="${col.id}" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;background:var(--bg-card);color:var(--text);">
      <select class="column-config-status" data-col-id="${col.id}" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--bg-card);color:var(--text);">
        <option value="">(custom)</option>
        ${statusOptions}
      </select>
      ${isDefault ? '' : `<button class="btn btn-danger btn-sm column-config-delete" data-col-id="${col.id}" style="padding:4px 8px;" title="Delete column">✕</button>`}
    </div>`;
  }).join('');

  // Color change handlers
  container.querySelectorAll('.column-config-color').forEach(input => {
    input.addEventListener('change', () => {
      updateCustomColumn(input.dataset.colId, { color: input.value });
      renderBoard();
    });
  });

  // Name change handlers
  container.querySelectorAll('.column-config-name').forEach(input => {
    input.addEventListener('blur', () => {
      const name = input.value.trim();
      if (name) {
        updateCustomColumn(input.dataset.colId, { name });
        renderBoard();
      }
    });
  });

  // Status change handlers
  container.querySelectorAll('.column-config-status').forEach(select => {
    select.addEventListener('change', () => {
      updateCustomColumn(select.dataset.colId, { status: select.value || null });
      renderBoard();
    });
  });

  // Delete handlers
  container.querySelectorAll('.column-config-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this column? Cards in it will be moved to To Do.')) {
        const col = columns.find(c => c.id === btn.dataset.colId);
        if (col && col.status) {
          // Move cards to To Do
          getIssues().filter(i => i.status === col.status).forEach(i => i.status = 'todo');
        }
        removeCustomColumn(btn.dataset.colId);
        renderColumnConfig();
        renderBoard();
        showToast('Column deleted', 'success');
      }
    });
  });

  // Drag to reorder
  let dragIdx = null;
  container.querySelectorAll('.column-config-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragIdx = item.dataset.colId;
      item.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      dragIdx = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      const targetId = item.dataset.colId;
      if (dragIdx && dragIdx !== targetId) {
        const orderMap = {};
        const newCols = getEffectiveColumns().filter(c => c.id !== dragIdx);
        const draggedCol = columns.find(c => c.id === dragIdx);
        const targetIdx = newCols.findIndex(c => c.id === targetId);
        newCols.splice(targetIdx, 0, draggedCol);
        newCols.forEach((c, i) => { c.order = i; });
        setCustomColumns(newCols);
        renderColumnConfig();
        renderBoard();
      }
    });
  });
}

// ===== Calendar View =====
let calendarYear, calendarMonth;

function initCalendar() {
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth();

  document.getElementById('calendar-prev')?.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendarView();
  });
  document.getElementById('calendar-next')?.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendarView();
  });
}

function renderCalendarView() {
  const container = document.getElementById('calendar-container');
  if (!container) return;

  const days = getCalendarDays(calendarYear, calendarMonth);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let html = '<div class="calendar-nav"><button class="btn btn-sm btn-calendar-prev" id="calendar-prev">◀</button><span class="calendar-month-label">' + getMonthName(calendarMonth) + ' ' + calendarYear + '</span><button class="btn btn-sm btn-calendar-next" id="calendar-next">▶</button></div>';
  html += '<div class="calendar-grid"><div class="calendar-header"><div class="calendar-day-name">Sun</div><div class="calendar-day-name">Mon</div><div class="calendar-day-name">Tue</div><div class="calendar-day-name">Wed</div><div class="calendar-day-name">Thu</div><div class="calendar-day-name">Fri</div><div class="calendar-day-name">Sat</div></div><div class="calendar-body">';

  days.forEach(day => {
    const isToday = day.isCurrentMonth && day.date.toDateString() === new Date().toDateString();
    const cls = day.isCurrentMonth ? 'calendar-day current-month' : 'calendar-day other-month';
    const overdue = day.dueIssues.filter(i => isOverdue(i.dueDate, i.status));
    const hasOverdue = overdue.length > 0;
    const hasDue = day.dueIssues.length > 0;

    html += '<div class="' + cls + (isToday ? ' today' : '') + (hasOverdue ? ' overdue' : '') + '" data-date="' + (day.dateStr || '') + '">';
    html += '<span class="calendar-day-num">' + day.date.getDate() + '</span>';
    if (hasDue) {
      day.dueIssues.slice(0, 3).forEach(i => {
        const color = { todo: '#9E9E9E', inprogress: '#D14A2A', review: '#D49B00' }[i.status] || '#9E9E9E';
        html += '<div class="calendar-issue-dot" style="background:' + color + '" title="' + escapeHtml(i.title) + '"></div>';
      });
      if (day.dueIssues.length > 3) {
        html += '<span class="calendar-more">+' + (day.dueIssues.length - 3) + '</span>';
      }
    }
    html += '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;

  // Re-bind navigation
  container.querySelector('#calendar-prev')?.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendarView();
  });
  container.querySelector('#calendar-next')?.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendarView();
  });

  // Click on day to show issues
  container.querySelectorAll('.calendar-day.current-month').forEach(day => {
    day.addEventListener('click', () => {
      const date = day.dataset.date;
      if (!date) return;
      const filtered = getIssues().filter(i => i.dueDate === date);
      if (filtered.length > 0) {
        const lines = filtered.map(i => {
          const key = generateIssueKey(getProjectKey(), i.id);
          const statusColor = { todo: '#9E9E9E', inprogress: '#D14A2A', review: '#D49B00', done: '#34A853' }[i.status] || '#9E9E9E';
          return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border-light);"><span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';flex-shrink:0;"></span><span style="font-size:11px;color:var(--text-muted);min-width:60px;">' + key + '</span><span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(i.title) + '</span><span style="font-size:10px;color:var(--text-muted);text-transform:capitalize;">' + i.status + '</span></div>';
        }).join('');
        if (undoToast) undoToast.remove();
        const toast = document.createElement('div');
        toast.className = 'toast toast-undo';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:16px 20px;border-radius:8px;font-size:13px;background:var(--bg-card);color:var(--text);box-shadow:0 4px 12px var(--shadow);z-index:200;max-width:400px;max-height:400px;overflow-y:auto;';
        toast.innerHTML = '<strong style="display:block;margin-bottom:8px;">📅 ' + formatDate(date) + '</strong>' + lines + '<button class="btn btn-sm" style="margin-top:8px;background:var(--primary);color:#fff;border:none;cursor:pointer;" onclick="this.parentElement.remove();">Close</button>';
        document.body.appendChild(toast);
        undoToast = toast;
        setTimeout(() => { if (undoToast === toast) { toast.remove(); undoToast = null; } }, 15000);
      }
    });
    day.style.cursor = 'pointer';
  });

}

// ===== renderCalendar (sidebar version) is deprecated — only renderCalendarView (board version) is used =====
// Kept temporarily for reference. Remove after confirming no callers.

// ===== Dashboard View =====
function renderDashboardView() {
  const container = document.getElementById('dashboard-container');
  if (!container) return;

  const total = getIssues().length;
  const byStatus = { todo: 0, inprogress: 0, review: 0, done: 0 };
  getIssues().forEach(i => { if (byStatus[i.status] !== undefined) byStatus[i.status]++; });
  const doneCount = byStatus.done;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const overdueCount = getIssues().filter(i => isOverdue(i.dueDate, i.status)).length;
  const highPriority = getIssues().filter(i => i.priority === 'high' && i.status !== 'done').length;
  const unassigned = getIssues().filter(i => !i.assignee).length;
  const dueThisWeek = getIssues().filter(i => {
    if (!i.dueDate || i.status === 'done') return false;
    const due = new Date(i.dueDate);
    const now = new Date();
    const diff = (due - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  // Assignee stats
  const byAssignee = {};
  getIssues().forEach(i => {
    const a = i.assignee || 'Unassigned';
    if (!byAssignee[a]) byAssignee[a] = { total: 0, done: 0, overdue: 0 };
    byAssignee[a].total++;
    if (i.status === 'done') byAssignee[a].done++;
    if (isOverdue(i.dueDate, i.status)) byAssignee[a].overdue++;
  });
  const assignees = Object.entries(byAssignee).sort((a, b) => b[1].total - a[1].total);
  const maxAssigneeTotal = assignees.length > 0 ? assignees[0][1].total : 1;

  // Priority breakdown
  const byPriority = { high: 0, medium: 0, low: 0 };
  getIssues().forEach(i => { if (byPriority[i.priority] !== undefined) byPriority[i.priority]++; });

  // Type breakdown
  const byType = { story: 0, bug: 0, task: 0, epic: 0 };
  getIssues().forEach(i => { if (byType[i.type] !== undefined) byType[i.type]++; });

  // Sprint progress
  const activeSprint = getActiveSprint();
  let sprintProgressHtml = '';
  if (activeSprint) {
    const sprintIssues = getIssues().filter(i => i.sprint === activeSprint.id);
    const sprintTotalSP = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const sprintDoneSP = sprintIssues.filter(i => i.status === 'done').reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const now = new Date();
    const start = new Date(activeSprint.startDate);
    const end = new Date(activeSprint.endDate);
    const totalDays = (end - start) / (1000 * 60 * 60 * 24);
    const elapsedDays = Math.max(0, (now - start) / (1000 * 60 * 60 * 24));
    const daysPct = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;
    const spPct = sprintTotalSP > 0 ? Math.round((sprintDoneSP / sprintTotalSP) * 100) : 0;
    sprintProgressHtml = '<div class="dashboard-chart"><h4 class="dashboard-chart-title">Current Sprint: ' + escapeHtml(activeSprint.name) + '</h4><div style="text-align:center;margin:12px 0;"><div style="font-size:32px;font-weight:700;color:var(--primary);">' + spPct + '%</div><div style="font-size:11px;color:var(--text-muted);">' + sprintDoneSP + '/' + sprintTotalSP + ' story points</div></div><div style="margin:8px 0;"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;"><span>Time: ' + daysPct + '%</span><span>Points: ' + spPct + '%</span></div><div style="display:flex;gap:4px;height:8px;border-radius:4px;overflow:hidden;background:var(--bg-page);"><div style="flex:' + daysPct + ';background:var(--info);border-radius:4px 0 0 4px;"></div><div style="flex:' + (100 - daysPct) + ';background:var(--border-light);"></div></div><div style="display:flex;gap:4px;height:8px;border-radius:4px;overflow:hidden;background:var(--bg-page);margin-top:4px;"><div style="flex:' + spPct + ';background:var(--success);border-radius:4px 0 0 4px;"></div><div style="flex:' + (100 - spPct) + ';background:var(--border-light);"></div></div></div></div>';
  }

  // Pie chart (CSS-only)
  const statusColors = { todo: '#9E9E9E', inprogress: '#D14A2A', review: '#D49B00', done: '#34A853' };
  const statusLabels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
  let pieConic = '';
  let cumulative = 0;
  Object.entries(byStatus).forEach(([status, count]) => {
    if (count === 0) return;
    const pct = (count / total) * 100;
    pieConic += statusColors[status] + ' ' + cumulative + '% ' + (cumulative + pct) + '%, ';
    cumulative += pct;
  });
  pieConic = pieConic.slice(0, -2);

  // Bar chart for assignees
  const barColors = ['#E53935', '#D14A2A', '#D49B00', '#34A853', '#2BB5A8', '#58A6FF', '#9E9E9E', '#F5C842'];

  container.innerHTML = '<div class="dashboard-stats"><div class="dashboard-stat-card"><div class="dashboard-stat-value">' + total + '</div><div class="dashboard-stat-label">Total Issues</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--success)">' + completionRate + '%</div><div class="dashboard-stat-label">Completion Rate</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--danger)">' + overdueCount + '</div><div class="dashboard-stat-label">Overdue</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--warning)">' + highPriority + '</div><div class="dashboard-stat-label">High Priority</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--info)">' + dueThisWeek + '</div><div class="dashboard-stat-label">Due This Week</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--text-muted)">' + unassigned + '</div><div class="dashboard-stat-label">Unassigned</div></div></div><div class="dashboard-charts"><div class="dashboard-chart"><h4 class="dashboard-chart-title">Issues by Status</h4><div class="dashboard-pie" style="background:conic-gradient(' + pieConic + ');"></div><div class="dashboard-legend">' + Object.entries(byStatus).filter(([,v]) => v > 0).map(([status, count]) => '<div class="dashboard-legend-item"><span class="dashboard-legend-dot" style="background:' + statusColors[status] + '"></span><span>' + statusLabels[status] + '</span><span class="dashboard-legend-count">' + count + '</span></div>').join('') + '</div></div><div class="dashboard-chart"><h4 class="dashboard-chart-title">Issues by Assignee</h4><div class="dashboard-bar-chart">' + assignees.map(([name, data], idx) => '<div class="dashboard-bar-row"><span class="dashboard-bar-label">' + escapeHtml(name) + '</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:' + (data.total / maxAssigneeTotal) * 100 + '%;background:' + barColors[idx % barColors.length] + '"></div></div><span class="dashboard-bar-value">' + data.total + '</span></div>').join('') + '</div></div><div class="dashboard-chart"><h4 class="dashboard-chart-title">By Type</h4><div class="dashboard-priority-bars">' + Object.entries(byType).map(([type, count]) => { const pct = total > 0 ? (count / total) * 100 : 0; const color = { story: '#2BB5A8', bug: '#E53935', task: '#34A853', epic: '#F5C842' }[type]; return '<div class="dashboard-bar-row"><span class="dashboard-bar-label">' + type.charAt(0).toUpperCase() + type.slice(1) + '</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div><span class="dashboard-bar-value">' + count + '</span></div>'; }).join('') + '</div></div>' + sprintProgressHtml + '<div class="dashboard-chart"><h4 class="dashboard-chart-title">By Priority</h4><div class="dashboard-priority-bars">' + Object.entries(byPriority).map(([priority, count]) => { const pct = total > 0 ? (count / total) * 100 : 0; const color = { high: '#E53935', medium: '#F5C842', low: '#34A853' }[priority]; return '<div class="dashboard-bar-row"><span class="dashboard-bar-label">' + priority.charAt(0).toUpperCase() + priority.slice(1) + '</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div><span class="dashboard-bar-value">' + count + '</span></div>'; }).join('') + '</div></div>';

}

function renderSavedFilters() {
  const list = document.getElementById('saved-filters');
  list.innerHTML = '';
  getSavedFilters().forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'saved-filter-item';
    item.innerHTML = `
      <span class="filter-name">${escapeHtml(f.name)}</span>
      <button class="filter-delete" data-idx="${idx}" title="Delete filter">✕</button>
    `;
    item.querySelector('.filter-name').addEventListener('click', () => applySavedFilter(idx));
    item.querySelector('.filter-delete').addEventListener('click', e => {
      e.stopPropagation();
      getSavedFilters().splice(idx, 1);
      saveState();
      renderSavedFilters();
    });
    list.appendChild(item);
  });
}

function renderActivity() {
  const feed = document.getElementById('activity-feed');
  feed.innerHTML = '';
  getActivityLog().slice(0, 15).forEach(a => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    const ago = timeAgo(a.time);
    // Skip emoji/non-Phosphor icon names to avoid console warnings
    const iconHtml = /^[a-z0-9-]+$/.test(a.icon)
      ? lucideIcon(a.icon, {class:'icon-sm'})
      : '';
    item.innerHTML = `
      <span class="activity-icon">${iconHtml}</span>
      <span class="activity-text">${a.text}</span>
      <span class="activity-time">${ago}</span>
    `;
    feed.appendChild(item);
  });
}

function switchProject(key) {
  // Task 2.4: Validate key before use
  if (!getProjects()[key]) return;
  setCurrentProject(key);
  setIssues(getProjects()[key].issues);
  renderSidebar();
  renderBoard();
  populateAssigneeFilter();
  const boardTitle = document.getElementById('board-title');
  if (boardTitle) boardTitle.textContent = `${getProjects()[key].icon} ${getProjects()[key].name} — Board`;
  // Update nav project name display
  const navName = document.getElementById('nav-project-name');
  if (navName) navName.textContent = getProjects()[key].name;
}

function switchView(view) {
  setCurrentView(view);
  renderViews();
  // Re-render Phosphor icons after view changes so sidebar icons are visible
  const board = document.getElementById('board');
  const calendarSection = document.getElementById('calendar-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const boardHeader = document.getElementById('board-title')?.closest('.board-header');
  const bulkBar = document.getElementById('bulk-bar');

  // Update board title to reflect current view
  const boardTitle = document.getElementById('board-title');
  if (boardTitle && getProjects()[getCurrentProject()]) {
    const viewLabels = { board: 'Board', list: 'List', calendar: 'Calendar', dashboard: 'Dashboard' };
    boardTitle.textContent = `${getProjects()[getCurrentProject()].icon} ${getProjects()[getCurrentProject()].name} — ${viewLabels[view] || 'Board'}`;
  }

  // Hide all view containers and sidebar calendar/dashboard sections
  board.style.display = 'none';
  let listView = document.getElementById('list-view');
  if (listView) listView.style.display = 'none';
  let calendarContainer = document.getElementById('calendar-container');
  if (calendarContainer) calendarContainer.style.display = 'none';
  let dashboardContainer = document.getElementById('dashboard-container');
  if (dashboardContainer) dashboardContainer.style.display = 'none';
  if (calendarSection) calendarSection.style.display = 'none';
  if (dashboardSection) dashboardSection.style.display = 'none';

  // Show the appropriate view container
  if (view === 'list') {
    if (!listView) {
      listView = document.createElement('div');
      listView.id = 'list-view';
      listView.className = 'list-view';
      board.after(listView);
    }
    listView.style.display = 'block';
    // Show board header (filters + sprint) for list view
    if (boardHeader) boardHeader.style.display = 'flex';
    if (bulkBar) bulkBar.style.display = 'none';
    renderListView();
  } else if (view === 'calendar') {
    if (!calendarContainer) {
      calendarContainer = document.createElement('div');
      calendarContainer.id = 'calendar-container';
      calendarContainer.className = 'calendar-container';
      board.after(calendarContainer);
    }
    calendarContainer.style.display = 'block';
    // Hide board header for calendar view
    if (boardHeader) boardHeader.style.display = 'none';
    if (bulkBar) bulkBar.style.display = 'none';
    renderCalendarView();
  } else if (view === 'dashboard') {
    if (!dashboardContainer) {
      dashboardContainer = document.createElement('div');
      dashboardContainer.id = 'dashboard-container';
      dashboardContainer.className = 'dashboard-container';
      board.after(dashboardContainer);
    }
    dashboardContainer.style.display = 'block';
    // Hide board header for dashboard view
    if (boardHeader) boardHeader.style.display = 'none';
    if (bulkBar) bulkBar.style.display = 'none';
    renderDashboardView();
  } else {
    // Board view
    board.style.display = 'flex';
    if (boardHeader) boardHeader.style.display = 'flex';
    if (bulkBar) bulkBar.style.display = 'none';
  }
}

function renderListView() {
  const container = document.getElementById('list-view');
  if (!container) return;
  // Apply sprint filter in list view
  const sprintFilter = document.getElementById('sprint-filter')?.value || 'all';
  let filtered = getFilteredIssues();
  if (sprintFilter !== 'all') {
    filtered = filtered.filter(i => i.sprint === sprintFilter);
  }
  const columns = getEffectiveColumns();
  const statusOrder = {};
  columns.forEach((c, i) => { if (c.status) statusOrder[c.status] = i; });
  // Sort by rank (custom ordering) within each status group
  filtered.sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
    if (statusDiff !== 0) return statusDiff;
    return (a.rank ?? 0) - (b.rank ?? 0);
  });
  const projectKey = getProjectKey();
  // Read current sort state
  let sortCol = localStorage.getItem('listview-sort') || 'key';
  let sortDir = localStorage.getItem('listview-dir') || 'asc';
  const sortArrow = (col) => col === sortCol ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  container.innerHTML = `
    <table class="issue-table">
      <thead>
        <tr>
          <th class="sortable" data-sort="type">Type${sortArrow('type')}</th>
          <th class="sortable" data-sort="key">Key${sortArrow('key')}</th>
          <th class="sortable" data-sort="summary">Summary${sortArrow('summary')}</th>
          <th class="sortable" data-sort="sp">SP${sortArrow('sp')}</th>
          <th class="sortable" data-sort="priority">Priority${sortArrow('priority')}</th>
          <th class="sortable" data-sort="assignee">Assignee${sortArrow('assignee')}</th>
          <th class="sortable" data-sort="sprint">Sprint${sortArrow('sprint')}</th>
          <th class="sortable" data-sort="status">Status${sortArrow('status')}</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(i => {
          const sprintName = i.sprint ? (getSprints()[i.sprint]?.name || '') : '';
          return `<tr data-id="${i.id}" class="list-row">
            <td>${lucideIcon(typeIcons[i.type] || 'File', {class:'icon'})} ${escapeHtml(i.type)}</td>
            <td class="issue-key">${generateIssueKey(projectKey, i.id)}</td>
            <td>${escapeHtml(i.title)}</td>
            <td>${i.storyPoints || '—'}</td>
            <td><span class="issue-priority priority-${escapeHtml(i.priority)}">${escapeHtml(i.priority)}</span></td>
            <td>${escapeHtml(i.assignee || '—')}</td>
            <td>${escapeHtml(sprintName || '—')}</td>
            <td>${escapeHtml(i.status)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  container.querySelectorAll('.list-row').forEach(row => {
    row.addEventListener('click', () => openDetailPanel(parseInt(row.dataset.id)));
  });
  // Sortable column headers
  container.querySelectorAll('.sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      localStorage.setItem('listview-sort', sortCol);
      localStorage.setItem('listview-dir', sortDir);
      renderListView();
    });
  });
}

function applySavedFilter(idx) {
  const f = getSavedFilters()[idx];
  if (!f) return;
  document.getElementById('filter-type').value = f.type || 'all';
  document.getElementById('filter-priority').value = f.priority || 'all';
  if (f.assignee) document.getElementById('filter-assignee').value = f.assignee;
  else document.getElementById('filter-assignee').value = 'all';
  applyFilters();
}

function saveCurrentFilter() {
  const name = prompt('Name this filter:') || 'Untitled';
  const f = {
    name,
    type: document.getElementById('filter-type').value,
    priority: document.getElementById('filter-priority').value,
    assignee: document.getElementById('filter-assignee').value,
  };
  if (f.type === 'all' && f.priority === 'all' && f.assignee === 'all') {
    showToast('Save a meaningful filter!', 'error');
    return;
  }
  getSavedFilters().push(f);
  saveState();
  renderSavedFilters();
}

function populateAssigneeFilter() {
  const assignees = [...new Set(getIssues().map(i => i.assignee).filter(Boolean))];
  const select = document.getElementById('filter-assignee');
  select.innerHTML = '<option value="all">All Assignees</option>';
  assignees.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    select.appendChild(opt);
  });
  // Add labels option if any exist
  const allLabels = getAllLabels();
  if (allLabels.length > 0) {
    const labelOpt = document.createElement('option');
    labelOpt.value = '__labels__';
    labelOpt.textContent = 'Labels...';
    select.appendChild(labelOpt);
  }
}
