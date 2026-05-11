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
  const icons = ['🚀', '🎯', '⚡', '🔥', '💡', '🌟', '🎨', '🔧'];
  const icon = icons[Math.floor(Math.random() * icons.length)];
  getProjects()[key] = { name, icon, key: key.toUpperCase(), issues: [] };
  saveState();
  switchProject(key);
  addActivity('Sparkles', `<strong>${escapeHtml(name)}</strong> project created`);
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
