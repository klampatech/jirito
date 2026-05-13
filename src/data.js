// ===== Data Operations =====

function exportData() {
  const data = {
    issues: getIssues(),
    comments: getComments(),
    projects: getProjects(),
    currentProject: getCurrentProject(),
    savedFilters: getSavedFilters(),
    activityLog: getActivityLog().map(a => ({ ...a, time: a.time.toISOString() })),
    issueCounter: getIssueCounter(),
    trash: getTrash().map(t => ({ ...t, date: t.date.toISOString() })),
    sprints: getSprints(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jirito-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  addActivity('Download', 'Exported board data');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.issues || !data.comments) throw new Error('Invalid format');
      // Task 1.2: Validate projects structure
      if (typeof data.projects !== 'object' || data.projects === null || Array.isArray(data.projects)) {
        throw new Error('Invalid projects format');
      }
      // Validate each project has required fields
      for (const [key, proj] of Object.entries(data.projects)) {
        if (typeof proj !== 'object' || proj === null) {
          throw new Error(`Invalid project "${key}"`);
        }
        if (typeof proj.name !== 'string' || proj.name.trim() === '') {
          throw new Error(`Project "${key}" must have a non-empty name`);
        }
        if (typeof proj.key !== 'string' || proj.key.trim() === '') {
          throw new Error(`Project "${key}" must have a non-empty key`);
        }
      }
      // Task 1.3: Validate comments structure
      if (typeof data.comments !== 'object' || data.comments === null || Array.isArray(data.comments)) {
        throw new Error('Invalid comments format');
      }
      // Validate required fields
      for (const issue of data.issues) {
        if (issue.id == null || issue.title == null || issue.status == null) {
          throw new Error('Imported issues must have id, title, and status fields');
        }
        // Validate title length
        if (typeof issue.title === 'string' && issue.title.length > LJ_CONSTANTS.MAX_TITLE_LENGTH) {
          throw new Error(`Issue #${issue.id}: title exceeds ${LJ_CONSTANTS.MAX_TITLE_LENGTH} characters`);
        }
        // Validate status is allowed
        if (!LJ_CONSTANTS.VALID_STATUSES.includes(issue.status)) {
          throw new Error(`Issue #${issue.id}: invalid status "${issue.status}" (allowed: ${LJ_CONSTANTS.VALID_STATUSES.join(', ')})`);
        }
        // Validate type if present
        if (issue.type != null && !LJ_CONSTANTS.VALID_ISSUE_TYPES.includes(issue.type)) {
          throw new Error(`Issue #${issue.id}: invalid type "${issue.type}" (allowed: ${LJ_CONSTANTS.VALID_ISSUE_TYPES.join(', ')})`);
        }
        // Validate priority if present
        if (issue.priority != null && !LJ_CONSTANTS.VALID_PRIORITIES.includes(issue.priority)) {
          throw new Error(`Issue #${issue.id}: invalid priority "${issue.priority}" (allowed: ${LJ_CONSTANTS.VALID_PRIORITIES.join(', ')})`);
        }
        // Validate id is positive integer
        if (typeof issue.id !== 'number' || issue.id < 1 || !Number.isInteger(issue.id)) {
          throw new Error(`Issue #${issue.id}: id must be a positive integer`);
        }
        // Sanitize labels: ensure array of strings
        if (issue.labels != null) {
          if (!Array.isArray(issue.labels)) {
            issue.labels = [issue.labels];
          }
          issue.labels = issue.labels.filter(l => typeof l === 'string' && l.trim());
        }
        // Sanitize assignee
        if (issue.assignee != null && typeof issue.assignee !== 'string') {
          issue.assignee = String(issue.assignee);
        }
        // Sanitize story points
        if (issue.storyPoints != null) {
          const sp = parseInt(issue.storyPoints);
          issue.storyPoints = (Number.isInteger(sp) && sp >= 0 && sp <= 100) ? sp : null;
        }
      }
      setIssues(data.issues);
      _comments = data.comments;
      setProjects(data.projects);
      setCurrentProject(data.currentProject || 'default');
      setSavedFilters(data.savedFilters || []);
      _activityLog = (data.activityLog || []).map(a => ({ ...a, time: new Date(a.time) }));
      // Prevent ID collision: ensure issueCounter is higher than any imported ID
      const maxId = Math.max(...getIssues().map(i => i.id), 0);
      setIssueCounter(Math.max(data.issueCounter || 106, maxId + 1));
      if (data.trash) {
        _trash = data.trash.map(t => ({ ...t, date: new Date(t.date) }));
        purgeTrash();
      }
      if (data.sprints) {
        _sprints = data.sprints;
      }
      // State synced via setters above
      selectedIds = getSelectedIds();
      trash = getTrash();
      saveState();
      renderBoard();
      renderSidebar();
      populateAssigneeFilter();
      updateCounts();
      addActivity('Upload', 'Imported board data');
      showToast('Import successful!', 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function createProject(name, key) {
  // Sanitize project key: only allow alphanumeric, dash, underscore
  const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().slice(0, LJ_CONSTANTS.MAX_PROJECT_KEY_LENGTH);
  if (!sanitizedKey) {
    showToast('Project key must contain only letters, numbers, dashes, and underscores.', 'error');
    return null;
  }
  const icons = ['🚀', '🎯', '⚡', '🔥', '💡', '🌟', '🎨', '🔧'];
  const icon = icons[Math.floor(Math.random() * icons.length)];
  getProjects()[sanitizedKey] = { name, icon, key: sanitizedKey, issues: [] };
  saveState();
  switchProject(sanitizedKey);
  addActivity('Sparkles', `<strong>${escapeHtml(name)}</strong> project created`);
  return sanitizedKey;
}

function deleteProject(key) {
  if (Object.keys(getProjects()).length <= 1) {
    showToast('You must have at least one project.', 'error');
    return;
  }
  if (!confirm(`Delete project "${getProjects()[key].name}" and all its issues?`)) return;
  // Move project issues to trash before deleting
  const projectIssues = getProjects()[key].issues.filter(i => i);
  if (projectIssues.length > 0) {
    getTrash().unshift({ issues: [...projectIssues], date: new Date() });
  }
  delete getProjects()[key];
  const remaining = Object.keys(getProjects())[0];
  saveState();
  switchProject(remaining);
}
