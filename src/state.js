// ===== State Management =====
// Module-scoped state with getter/setter accessors.
// No bare-module aliases — all external code uses get/set functions.

const ACTIVITY_LOG_MAX = LJ_CONSTANTS.ACTIVITY_LOG_MAX;
const TRASH_RETENTION_MS = LJ_CONSTANTS.TRASH_RETENTION_MS;
const ISSUE_COUNTER_START = LJ_CONSTANTS.ISSUE_COUNTER_START;
const DUPLICATE_WORD_OVERLAP = LJ_CONSTANTS.DUPLICATE_WORD_OVERLAP;

// Internal state storage
let _issues = [];
let _issueCounter = ISSUE_COUNTER_START;
let _currentDetailIssue = null;
let _comments = {};
let _currentProject = 'default';
let _currentView = 'board';
let _projects = {};
let _savedFilters = [];
let _activityLog = [];
let _selectedIds = new Set();
let _trash = [];
let _sprints = {};
let _customColumns = {};
let _markdownCache = {};

// ===== Getter / Setter Accessors =====

function getIssues() { return _issues; }
function setIssues(v) { _issues = v; }

function getIssueCounter() { return _issueCounter; }
function setIssueCounter(v) { _issueCounter = v; }

function getCurrentDetailIssue() { return _currentDetailIssue; }
function setCurrentDetailIssue(v) { _currentDetailIssue = v; }

function getComments() { return _comments; }

function getCurrentProject() { return _currentProject; }
function setCurrentProject(v) { _currentProject = v; }

function getCurrentView() { return _currentView; }
function setCurrentView(v) { _currentView = v; }

function getProjects() { return _projects; }

function getSavedFilters() { return _savedFilters; }
function setSavedFilters(v) { _savedFilters = v; }

function getActivityLog() { return _activityLog; }
function setActivityLog(v) { _activityLog = v; }

function getSelectedIds() { return _selectedIds; }

function getTrash() { return _trash; }
function setTrash(v) { _trash = v; }

function getSprints() {
  if (!_sprints) _sprints = {};
  return _sprints;
}
function setSprints(v) { _sprints = v; }

function getCustomColumns() { return _customColumns; }
function setCustomColumns(v) { _customColumns = v; }

function getMarkdownCache() { return _markdownCache; }

// ===== Activity =====

function addActivity(icon, text) {
  _activityLog.unshift({ icon, text, time: new Date() });
  if (_activityLog.length > ACTIVITY_LOG_MAX) _activityLog.pop();
  renderActivity();
}

// ===== State Load / Save =====

function loadState() {
  const saved = localStorage.getItem('jirito-issues');
  const savedComments = localStorage.getItem('jirito-comments');
  const savedProjects = localStorage.getItem('jirito-projects');
  const savedCurrentProject = localStorage.getItem('jirito-currentProject');
  const savedFiltersRaw = localStorage.getItem('jirito-savedFilters');
  const savedActivity = localStorage.getItem('jirito-activity');
  const savedTrash = localStorage.getItem('jirito-trash');
  const savedSprints = localStorage.getItem('jirito-sprints');
  const savedCustomColumns = localStorage.getItem('jirito-customColumns');
  if (saved) {
    _issues = JSON.parse(saved);
    _issueCounter = Math.max(..._issues.map(i => i.id), ISSUE_COUNTER_START);
  } else {
    _issues = [...sampleIssues];
    _issueCounter = 106;
  }
  if (savedComments) _comments = JSON.parse(savedComments);
  if (savedProjects) _projects = JSON.parse(savedProjects);
  // Ensure default project exists before checking currentProject
  if (!_projects['default']) {
    _projects['default'] = { name: 'Project Alpha', icon: '📋', key: 'PROJ', issues: _issues.length > 0 ? _issues : [...sampleIssues] };
  }
  // Validate currentProject exists in projects before restoring
  if (savedCurrentProject && _projects[savedCurrentProject]) {
    _currentProject = savedCurrentProject;
  } else if (_projects['default']) {
    _currentProject = 'default';
  }
  if (savedFiltersRaw) _savedFilters = JSON.parse(savedFiltersRaw);
  if (savedActivity) {
    _activityLog = JSON.parse(savedActivity).map(a => ({ ...a, time: new Date(a.time) }));
  }
  if (savedTrash) {
    _trash = JSON.parse(savedTrash).map(t => ({ ...t, date: new Date(t.date) }));
    purgeTrash();
  }
  if (savedSprints) {
    _sprints = JSON.parse(savedSprints);
  }
  if (savedCustomColumns) {
    _customColumns = JSON.parse(savedCustomColumns);
  }
}

function saveState() {
  localStorage.setItem('jirito-issues', JSON.stringify(_issues));
  localStorage.setItem('jirito-comments', JSON.stringify(_comments));
  localStorage.setItem('jirito-projects', JSON.stringify(_projects));
  localStorage.setItem('jirito-currentProject', _currentProject);
  localStorage.setItem('jirito-savedFilters', JSON.stringify(_savedFilters));
  localStorage.setItem('jirito-activity', JSON.stringify(_activityLog.map(a => ({ ...a, time: a.time.toISOString() }))));
  localStorage.setItem('jirito-trash', JSON.stringify(_trash.map(t => ({ ...t, date: t.date.toISOString() }))));
  localStorage.setItem('jirito-sprints', JSON.stringify(_sprints));
}

// Debounced save: batches multiple rapid saveState() calls into one localStorage write.
// Used for bulk operations to avoid blocking the main thread.
let _saveStateTimer = null;
function saveStateDebounced() {
  if (_saveStateTimer) {
    clearTimeout(_saveStateTimer);
  }
  _saveStateTimer = setTimeout(() => {
    saveState();
    _saveStateTimer = null;
  }, LJ_CONSTANTS.SAVE_STATE_DEBOUNCE_MS);
}

// Force immediate save (no debounce) — use for critical single operations
function saveStateImmediate() {
  if (_saveStateTimer) {
    clearTimeout(_saveStateTimer);
    _saveStateTimer = null;
  }
  saveState();
}

// ===== Trash =====

function purgeTrash() {
  const now = new Date();
  _trash = _trash.filter(t => (now - new Date(t.date)) < TRASH_RETENTION_MS);
}

function moveToTrash(issue) {
  _trash.unshift({ issues: [issue], date: new Date() });
  saveState();
}

function restoreFromTrash(idx) {
  if (idx < 0 || idx >= _trash.length) return;
  const entry = _trash[idx];
  entry.issues.forEach(i => {
    i.status = 'todo';
    _issues.push(i);
  });
  _trash.splice(idx, 1);
  saveState();
  renderBoard();
  updateCounts();
}

// ===== Sprints =====

function saveSprints() {
  localStorage.setItem('jirito-sprints', JSON.stringify(getSprints()));
  localStorage.setItem('jirito-customColumns', JSON.stringify(_customColumns));
}

function createSprint(name, startDate, endDate) {
  const sprints = getSprints();
  const id = 'sprint-' + Date.now();
  sprints[id] = { id, name, startDate, endDate, active: false, archived: false };
  saveSprints();
  return sprints[id];
}

function updateSprint(id, updates) {
  const sprints = getSprints();
  if (sprints[id]) {
    Object.assign(sprints[id], updates);
    saveSprints();
  }
}

function deleteSprint(id) {
  const sprints = getSprints();
  if (sprints[id]) {
    _issues.forEach(i => { if (i.sprint === id) i.sprint = null; });
    delete sprints[id];
    saveSprints();
  }
}

function getActiveSprint() {
  const sprints = getSprints();
  const now = new Date();
  for (const s of Object.values(sprints)) {
    if (!s.archived && s.startDate && s.endDate) {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      if (now >= start && now <= end) return s;
    }
  }
  return null;
}

function getActiveSprintId() {
  const active = getActiveSprint();
  return active ? active.id : null;
}

// ===== Dependencies =====

function addDependency(issueId, targetId, type) {
  const issue = _issues.find(i => i.id === issueId);
  if (!issue) return;
  if (!issue.dependencies) issue.dependencies = [];
  if (!issue.dependencies.find(d => d.targetId === targetId && d.type === type)) {
    issue.dependencies.push({ targetId, type, created: new Date().toISOString() });
  }
  // Create reverse link for "blocks" type
  if (type === 'blocks') {
    const target = _issues.find(i => i.id === targetId);
    if (target && !target.dependencies) target.dependencies = [];
    if (target && !target.dependencies.find(d => d.targetId === issueId && d.type === 'relates-to')) {
      target.dependencies.push({ targetId: issueId, type: 'relates-to', created: new Date().toISOString() });
    }
  }
  saveState();
}

function removeDependency(issueId, targetId, type) {
  const issue = _issues.find(i => i.id === issueId);
  if (!issue || !issue.dependencies) return;
  issue.dependencies = issue.dependencies.filter(d => !(d.targetId === targetId && d.type === type));
  // Remove reverse link for "blocks" type
  if (type === 'blocks') {
    const target = _issues.find(i => i.id === targetId);
    if (target && target.dependencies) {
      target.dependencies = target.dependencies.filter(d => !(d.targetId === issueId && d.type === 'relates-to'));
    }
  }
  saveState();
}

function hasCircularDependency(issueId, targetId, visited = new Set()) {
  if (issueId === targetId) return true;
  if (visited.has(targetId)) return false;
  visited.add(targetId);
  const target = _issues.find(i => i.id === targetId);
  if (!target || !target.dependencies) return false;
  return target.dependencies.some(d => hasCircularDependency(issueId, d.targetId, visited));
}

function getDependencies(issueId) {
  const issue = _issues.find(i => i.id === issueId);
  return issue && issue.dependencies ? issue.dependencies : [];
}

function getDependents(issueId) {
  return _issues.filter(i => {
    if (!i.dependencies) return false;
    return i.dependencies.some(d => d.targetId === issueId);
  });
}

// ===== Sample Data =====

const sampleIssues = [
  { id: 101, title: "Design login page mockup", desc: "Create wireframes for the new login flow", type: "story", priority: "high", assignee: "Alice", status: "todo", dueDate: "2026-05-15", labels: ["design"], storyPoints: 5, rank: 0 },
  { id: 102, title: "Fix auth token refresh bug", desc: "Tokens expire too early on mobile", type: "bug", priority: "high", assignee: "Bob", status: "inprogress", dueDate: "2026-05-01", labels: ["bug", "auth"], storyPoints: 3, rank: 1 },
  { id: 103, title: "Set up CI/CD pipeline", desc: "GitHub Actions for staging and prod", type: "task", priority: "medium", assignee: "Charlie", status: "todo", dueDate: "2026-06-01", labels: ["devops"], storyPoints: 8, rank: 2 },
  { id: 104, title: "Write API documentation", desc: "OpenAPI spec for all endpoints", type: "story", priority: "medium", assignee: "Alice", status: "review", dueDate: null, labels: ["docs"], storyPoints: 5, rank: 3 },
  { id: 105, title: "Update dependencies", desc: "Bump all npm packages to latest", type: "task", priority: "low", assignee: "Bob", status: "done", dueDate: "2026-04-20", labels: [], storyPoints: 2, rank: 4 },
  { id: 106, title: "Implement dark mode toggle", desc: "Add theme switcher in settings", type: "story", priority: "low", assignee: "Diana", status: "todo", dueDate: null, labels: ["feature"], storyPoints: 3, rank: 5 },
];

const typeIcons = { story: "FileText", bug: "Bug", task: "CheckSquare", epic: "Mountain" };

// ===== Duplicate Detection =====

function findDuplicateIssues(title) {
  if (!title || title.length < 3) return [];
  const normalized = title.toLowerCase().trim();
  return _issues.filter(i => {
    if (!i.title) return false;
    const other = i.title.toLowerCase().trim();
    // Exact match
    if (normalized === other) return false;
    // Contains match
    if (normalized.includes(other) || other.includes(normalized)) return true;
    // Word overlap (>= 60% of words match)
    const wordsA = normalized.split(/\s+/).filter(w => w.length > 2);
    const wordsB = other.split(/\s+/).filter(w => w.length > 2);
    if (wordsA.length < 2 || wordsB.length < 2) return false;
    const shorter = wordsA.length < wordsB.length ? wordsA : wordsB;
    const longer = wordsA.length < wordsB.length ? wordsB : wordsA;
    let matches = 0;
    shorter.forEach(w => { if (longer.includes(w)) matches++; });
    return matches / shorter.length >= DUPLICATE_WORD_OVERLAP;
  });
}

// ===== Custom Column Helpers =====

function getDefaultColumns() {
  return [
    { id: 'todo', name: 'To Do', color: '#9E9E9E', status: 'todo', order: 0 },
    { id: 'inprogress', name: 'In Progress', color: '#D14A2A', status: 'inprogress', order: 1 },
    { id: 'review', name: 'In Review', color: '#D49B00', status: 'review', order: 2 },
    { id: 'done', name: 'Done', color: '#34A853', status: 'done', order: 3 },
  ];
}

function getEffectiveColumns() {
  const custom = getCustomColumns();
  if (custom && custom.length > 0) {
    return custom.sort((a, b) => a.order - b.order);
  }
  return getDefaultColumns();
}

function addCustomColumn(name, color) {
  const columns = getEffectiveColumns();
  const id = 'col-' + Date.now();
  columns.push({ id, name, color: color || '#9E9E9E', status: null, order: columns.length });
  setCustomColumns(columns);
  return id;
}

function removeCustomColumn(id) {
  const columns = getEffectiveColumns();
  const filtered = columns.filter(c => c.id !== id);
  setCustomColumns(filtered);
}

function updateCustomColumn(id, updates) {
  const columns = getEffectiveColumns();
  const col = columns.find(c => c.id === id);
  if (col) {
    Object.assign(col, updates);
    setCustomColumns(columns);
  }
}

function reorderColumns(orderMap) {
  const columns = getEffectiveColumns();
  columns.forEach(c => { if (orderMap[c.id] !== undefined) c.order = orderMap[c.id]; });
  setCustomColumns(columns);
}

// ===== Data Initialization (Task 2.2: Consolidated migration logic) =====

function initializeData() {
  // 1. Ensure default project exists
  if (!_projects['default']) {
    _projects['default'] = { name: 'Project Alpha', icon: '📋', key: 'PROJ', issues: _issues.length > 0 ? _issues : [...sampleIssues] };
  }
  // 2. Ensure currentProject is valid
  if (!_projects[_currentProject]) {
    _currentProject = 'default';
  }
  // 3. Sync global issues with current project
  _issues = _projects[_currentProject].issues;
  // 4. Ensure project key exists
  if (!_projects[_currentProject].key) {
    _projects[_currentProject].key = _currentProject.toUpperCase();
  }
}
