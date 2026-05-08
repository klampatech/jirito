// ===== Data Operations =====

function exportData() {
  const data = {
    issues: LJ.issues,
    comments: LJ.comments,
    projects: LJ.projects,
    currentProject: LJ.currentProject,
    savedFilters: LJ.savedFilters,
    activityLog: LJ.activityLog.map(a => ({ ...a, time: a.time.toISOString() })),
    issueCounter: LJ.issueCounter,
    trash: LJ.trash.map(t => ({ ...t, date: t.date.toISOString() })),
    sprints: LJ.sprints,
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
      LJ.issues = data.issues;
      LJ.comments = data.comments;
      LJ.projects = data.projects;
      LJ.currentProject = data.currentProject || 'default';
      LJ.savedFilters = data.savedFilters || [];
      LJ.activityLog = (data.activityLog || []).map(a => ({ ...a, time: new Date(a.time) }));
      // Prevent ID collision: ensure issueCounter is higher than any imported ID
      const maxId = Math.max(...LJ.issues.map(i => i.id), 0);
      LJ.issueCounter = Math.max(data.issueCounter || 106, maxId + 1);
      if (data.trash) {
        LJ.trash = data.trash.map(t => ({ ...t, date: new Date(t.date) }));
        purgeTrash();
      }
      if (data.sprints) {
        LJ.sprints = data.sprints;
      }
      // Sync aliases
      issues = LJ.issues;
      issueCounter = LJ.issueCounter;
      currentDetailIssue = LJ.currentDetailIssue;
      comments = LJ.comments;
      currentProject = LJ.currentProject;
      currentView = LJ.currentView;
      projects = LJ.projects;
      savedFilters = LJ.savedFilters;
      activityLog = LJ.activityLog;
      selectedIds = LJ.selectedIds;
      trash = LJ.trash;
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
  LJ.projects[key] = { name, icon, key: key.toUpperCase(), issues: [] };
  saveState();
  switchProject(key);
  addActivity('Sparkles', `<strong>${escapeHtml(name)}</strong> project created`);
}

function deleteProject(key) {
  if (Object.keys(LJ.projects).length <= 1) {
    showToast('You must have at least one project.', 'error');
    return;
  }
  if (!confirm(`Delete project "${LJ.projects[key].name}" and all its issues?`)) return;
  // Move project issues to trash before deleting
  const projectIssues = LJ.projects[key].issues.filter(i => i);
  if (projectIssues.length > 0) {
    LJ.trash.unshift({ issues: [...projectIssues], date: new Date() });
  }
  delete LJ.projects[key];
  const remaining = Object.keys(LJ.projects)[0];
  saveState();
  switchProject(remaining);
}
