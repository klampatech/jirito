// ===== State Management =====

// LJ namespace: all shared state lives here to prevent global pollution
const LJ = {
  issues: [],
  issueCounter: 100,
  currentDetailIssue: null,
  comments: {}, // { issueId: [{ author, text, date }] }
  currentProject: 'default',
  currentView: 'board', // 'board' | 'list'
  projects: {}, // { key: { name, icon, key, issues } }
  savedFilters: [], // [{ name, type, priority, assignee }]
  activityLog: [], // [{ icon, text, time }]
  // Intentionally not persisted — bulk selection is ephemeral across page reloads
  selectedIds: new Set(),
  trash: [], // { issues: [...], date: Date }
  sprints: {}, // { id: { id, name, startDate, endDate, active, archived } }
  // Custom column definitions (per project)
  customColumns: {}, // { projectKey: [{ id, name, color, status, order }] }
  // Markdown rendering cache
  markdownCache: {},
};

// Backwards-compatible aliases for functions that still reference bare names
let issues = LJ.issues;
let issueCounter = LJ.issueCounter;
let currentDetailIssue = LJ.currentDetailIssue;
let comments = LJ.comments;
let currentProject = LJ.currentProject;
let currentView = LJ.currentView;
let projects = LJ.projects;
let savedFilters = LJ.savedFilters;
let activityLog = LJ.activityLog;
let selectedIds = LJ.selectedIds;
let trash = LJ.trash;

function addActivity(icon, text) {
  LJ.activityLog.unshift({ icon, text, time: new Date() });
  if (LJ.activityLog.length > 50) LJ.activityLog.pop();
  renderActivity();
}

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
    LJ.issues = JSON.parse(saved);
    LJ.issueCounter = Math.max(...LJ.issues.map(i => i.id), 100);
  } else {
    LJ.issues = [...sampleIssues];
    LJ.issueCounter = 106;
  }
  if (savedComments) LJ.comments = JSON.parse(savedComments);
  if (savedProjects) LJ.projects = JSON.parse(savedProjects);
  // Ensure default project exists before checking currentProject
  if (!LJ.projects['default']) {
    LJ.projects['default'] = { name: 'Project Alpha', icon: '📋', key: 'PROJ', issues: LJ.issues.length > 0 ? LJ.issues : [...sampleIssues] };
  }
  // Validate currentProject exists in projects before restoring
  if (savedCurrentProject && LJ.projects[savedCurrentProject]) {
    LJ.currentProject = savedCurrentProject;
  } else if (LJ.projects['default']) {
    LJ.currentProject = 'default';
  }
  if (savedFiltersRaw) LJ.savedFilters = JSON.parse(savedFiltersRaw);
  if (savedActivity) {
    LJ.activityLog = JSON.parse(savedActivity).map(a => ({ ...a, time: new Date(a.time) }));
  }
  if (savedTrash) {
    LJ.trash = JSON.parse(savedTrash).map(t => ({ ...t, date: new Date(t.date) }));
    purgeTrash();
  }
  if (savedSprints) {
    LJ.sprints = JSON.parse(savedSprints);
  }
  if (savedCustomColumns) {
    LJ.customColumns = JSON.parse(savedCustomColumns);
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
}

function saveState() {
  localStorage.setItem('jirito-issues', JSON.stringify(LJ.issues));
  localStorage.setItem('jirito-comments', JSON.stringify(LJ.comments));
  localStorage.setItem('jirito-projects', JSON.stringify(LJ.projects));
  localStorage.setItem('jirito-currentProject', LJ.currentProject);
  localStorage.setItem('jirito-savedFilters', JSON.stringify(LJ.savedFilters));
  localStorage.setItem('jirito-activity', JSON.stringify(LJ.activityLog.map(a => ({ ...a, time: a.time.toISOString() }))));
  localStorage.setItem('jirito-trash', JSON.stringify(LJ.trash.map(t => ({ ...t, date: t.date.toISOString() }))));
  localStorage.setItem('jirito-sprints', JSON.stringify(LJ.sprints));
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
  }, 300);
}

// Force immediate save (no debounce) — use for critical single operations
function saveStateImmediate() {
  if (_saveStateTimer) {
    clearTimeout(_saveStateTimer);
    _saveStateTimer = null;
  }
  saveState();
}

function purgeTrash() {
  const now = new Date();
  LJ.trash = LJ.trash.filter(t => (now - new Date(t.date)) < 7 * 24 * 60 * 60 * 1000);
}

function moveToTrash(issue) {
  LJ.trash.unshift({ issues: [issue], date: new Date() });
  saveState();
}

function restoreFromTrash(idx) {
  if (idx < 0 || idx >= LJ.trash.length) return;
  const entry = LJ.trash[idx];
  entry.issues.forEach(i => {
    i.status = 'todo';
    LJ.issues.push(i);
  });
  LJ.trash.splice(idx, 1);
  saveState();
  renderBoard();
  updateCounts();
}

// ===== Sprints =====
function getSprints() {
  if (!LJ.sprints) LJ.sprints = {};
  return LJ.sprints;
}

function saveSprints() {
  localStorage.setItem('jirito-sprints', JSON.stringify(getSprints()));
  localStorage.setItem('jirito-customColumns', JSON.stringify(LJ.customColumns));
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
    // Unassign issues from this sprint
    LJ.issues.forEach(i => { if (i.sprint === id) i.sprint = null; });
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
  const issue = LJ.issues.find(i => i.id === issueId);
  if (!issue) return;
  if (!issue.dependencies) issue.dependencies = [];
  if (!issue.dependencies.find(d => d.targetId === targetId && d.type === type)) {
    issue.dependencies.push({ targetId, type, created: new Date().toISOString() });
  }
  // Create reverse link for "blocks" type
  if (type === 'blocks') {
    const target = LJ.issues.find(i => i.id === targetId);
    if (target && !target.dependencies) target.dependencies = [];
    if (target && !target.dependencies.find(d => d.targetId === issueId && d.type === 'relates-to')) {
      target.dependencies.push({ targetId: issueId, type: 'relates-to', created: new Date().toISOString() });
    }
  }
  saveState();
}

function removeDependency(issueId, targetId, type) {
  const issue = LJ.issues.find(i => i.id === issueId);
  if (!issue || !issue.dependencies) return;
  issue.dependencies = issue.dependencies.filter(d => !(d.targetId === targetId && d.type === type));
  // Remove reverse link for "blocks" type
  if (type === 'blocks') {
    const target = LJ.issues.find(i => i.id === targetId);
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
  const target = LJ.issues.find(i => i.id === targetId);
  if (!target || !target.dependencies) return false;
  return target.dependencies.some(d => hasCircularDependency(issueId, d.targetId, visited));
}



function getDependencies(issueId) {
  const issue = LJ.issues.find(i => i.id === issueId);
  return issue && issue.dependencies ? issue.dependencies : [];
}

function getDependents(issueId) {
  return LJ.issues.filter(i => {
    if (!i.dependencies) return false;
    return i.dependencies.some(d => d.targetId === issueId);
  });
}

const sampleIssues = [
  { id: 101, title: "Design login page mockup", desc: "Create wireframes for the new login flow", type: "story", priority: "high", assignee: "Alice", status: "todo", dueDate: "2026-05-15", labels: ["design"], storyPoints: 5, rank: 0 },
  { id: 102, title: "Fix auth token refresh bug", desc: "Tokens expire too early on mobile", type: "bug", priority: "high", assignee: "Bob", status: "inprogress", dueDate: "2026-05-01", labels: ["bug", "auth"], storyPoints: 3, rank: 1 },
  { id: 103, title: "Set up CI/CD pipeline", desc: "GitHub Actions for staging and prod", type: "task", priority: "medium", assignee: "Charlie", status: "todo", dueDate: "2026-06-01", labels: ["devops"], storyPoints: 8, rank: 2 },
  { id: 104, title: "Write API documentation", desc: "OpenAPI spec for all endpoints", type: "story", priority: "medium", assignee: "Alice", status: "review", dueDate: null, labels: ["docs"], storyPoints: 5, rank: 3 },
  { id: 105, title: "Update dependencies", desc: "Bump all npm packages to latest", type: "task", priority: "low", assignee: "Bob", status: "done", dueDate: "2026-04-20", labels: [], storyPoints: 2, rank: 4 },
  { id: 106, title: "Implement dark mode toggle", desc: "Add theme switcher in settings", type: "story", priority: "low", assignee: "Diana", status: "todo", dueDate: null, labels: ["feature"], storyPoints: 3, rank: 5 },
];

const typeIcons = { story: "file-text", bug: "bug", task: "check-square", epic: "mountain" };

// ===== Duplicate Detection =====
function findDuplicateIssues(title) {
  if (!title || title.length < 3) return [];
  const normalized = title.toLowerCase().trim();
  return LJ.issues.filter(i => {
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
    return matches / shorter.length >= 0.6;
  });
}

// ===== Custom Column Helpers =====
function getCustomColumns() {
  return LJ.customColumns[LJ.currentProject] || null;
}

function setCustomColumns(columns) {
  if (!LJ.customColumns[LJ.currentProject]) LJ.customColumns[LJ.currentProject] = [];
  LJ.customColumns[LJ.currentProject] = columns;
  saveState();
}

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
  if (!LJ.projects['default']) {
    LJ.projects['default'] = { name: 'Project Alpha', icon: '📋', key: 'PROJ', issues: LJ.issues.length > 0 ? LJ.issues : [...sampleIssues] };
  }
  // 2. Ensure currentProject is valid
  if (!LJ.projects[LJ.currentProject]) {
    LJ.currentProject = 'default';
  }
  // 3. Sync global issues with current project
  LJ.issues = LJ.projects[LJ.currentProject].issues;
  // 4. Ensure project key exists
  if (!LJ.projects[LJ.currentProject].key) {
    LJ.projects[LJ.currentProject].key = LJ.currentProject.toUpperCase();
  }
  // 5. Sync aliases
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
}
