// ===== State =====
let issues = [];
let issueCounter = 100;
let currentDetailIssue = null;
let comments = {}; // { issueId: [{ author, text, date }] }
let currentProject = 'default';
let currentView = 'board'; // 'board' | 'list'
let projects = {}; // { key: { name, icon, issues } }
let savedFilters = []; // [{ name, type, priority, assignee }]
let activityLog = []; // [{ icon, text, time }]

function addActivity(icon, text) {
  activityLog.unshift({ icon, text, time: new Date() });
  if (activityLog.length > 50) activityLog.pop();
  renderActivity();
}

function loadState() {
  const saved = localStorage.getItem('jira-clone-issues');
  const savedComments = localStorage.getItem('jira-clone-comments');
  const savedProjects = localStorage.getItem('jira-clone-projects');
  const savedCurrentProject = localStorage.getItem('jira-clone-currentProject');
  const savedFiltersRaw = localStorage.getItem('jira-clone-savedFilters');
  const savedActivity = localStorage.getItem('jira-clone-activity');
  if (saved) {
    issues = JSON.parse(saved);
    issueCounter = Math.max(...issues.map(i => i.id), 100);
  } else {
    issues = [...sampleIssues];
    issueCounter = 106;
  }
  if (savedComments) comments = JSON.parse(savedComments);
  if (savedProjects) projects = JSON.parse(savedProjects);
  if (savedCurrentProject && projects[savedCurrentProject]) currentProject = savedCurrentProject;
  if (savedFiltersRaw) savedFilters = JSON.parse(savedFiltersRaw);
  if (savedActivity) {
    activityLog = JSON.parse(savedActivity).map(a => ({ ...a, time: new Date(a.time) }));
  }
}

function saveState() {
  localStorage.setItem('jira-clone-issues', JSON.stringify(issues));
  localStorage.setItem('jira-clone-comments', JSON.stringify(comments));
  localStorage.setItem('jira-clone-projects', JSON.stringify(projects));
  localStorage.setItem('jira-clone-currentProject', currentProject);
  localStorage.setItem('jira-clone-savedFilters', JSON.stringify(savedFilters));
  localStorage.setItem('jira-clone-activity', JSON.stringify(activityLog.map(a => ({ ...a, time: a.time.toISOString() }))));
}

const sampleIssues = [
  { id: 101, title: "Design login page mockup", desc: "Create wireframes for the new login flow", type: "story", priority: "high", assignee: "Alice", status: "todo" },
  { id: 102, title: "Fix auth token refresh bug", desc: "Tokens expire too early on mobile", type: "bug", priority: "high", assignee: "Bob", status: "inprogress" },
  { id: 103, title: "Set up CI/CD pipeline", desc: "GitHub Actions for staging and prod", type: "task", priority: "medium", assignee: "Charlie", status: "todo" },
  { id: 104, title: "Write API documentation", desc: "OpenAPI spec for all endpoints", type: "story", priority: "medium", assignee: "Alice", status: "review" },
  { id: 105, title: "Update dependencies", desc: "Bump all npm packages to latest", type: "task", priority: "low", assignee: "Bob", status: "done" },
  { id: 106, title: "Implement dark mode toggle", desc: "Add theme switcher in settings", type: "story", priority: "low", assignee: "Diana", status: "todo" },
];

// ===== Type Icons =====
const typeIcons = { story: "📖", bug: "🐛", task: "✅", epic: "🏔️" };

// ===== Render =====
function renderBoard() {
  document.querySelectorAll('.column-body').forEach(col => {
    const status = col.dataset.status;
    col.innerHTML = '';
    const colIssues = issues.filter(i => i.status === status);
    colIssues.forEach(issue => {
      col.appendChild(createCard(issue));
    });
  });
  updateCounts();
}

function createCard(issue) {
  const card = document.createElement('div');
  card.className = 'issue-card';
  card.draggable = true;
  card.dataset.id = issue.id;

  const commentCount = (comments[issue.id] || []).length;

  card.innerHTML = `
    <div class="issue-card-header">
      <span class="issue-key">PROJ-${issue.id}</span>
      <span class="issue-type-icon">${typeIcons[issue.type] || '📄'}</span>
    </div>
    <div class="issue-title">${escapeHtml(issue.title)}</div>
    ${issue.desc ? `<div class="issue-desc">${escapeHtml(issue.desc)}</div>` : ''}
    <div class="issue-card-footer">
      <span class="issue-priority priority-${issue.priority}">${issue.priority}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        ${commentCount > 0 ? `<span class="issue-comments-badge">💬 ${commentCount}</span>` : ''}
        ${issue.assignee ? `<div class="issue-assignee" title="${escapeHtml(issue.assignee)}">${issue.assignee.charAt(0).toUpperCase()}</div>` : ''}
      </div>
    </div>
  `;

  // Click to open detail panel
  card.addEventListener('click', () => openDetailPanel(issue.id));

  // Drag events
  card.addEventListener('dragstart', e => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(issue.id));
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateCounts() {
  ['todo', 'inprogress', 'review', 'done'].forEach(status => {
    const countEl = document.querySelector(`[data-count-for="${status}"]`);
    if (countEl) {
      countEl.textContent = issues.filter(i => i.status === status).length;
    }
  });
}

// ===== Filter =====
function applyFilters() {
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('filter-type')?.value || 'all';
  const priorityFilter = document.getElementById('filter-priority')?.value || 'all';
  const assigneeFilter = document.getElementById('filter-assignee')?.value || 'all';

  document.querySelectorAll('.column-body').forEach(col => {
    const status = col.dataset.status;
    col.innerHTML = '';
    const filtered = issues.filter(i => {
      if (typeFilter !== 'all' && i.type !== typeFilter) return false;
      if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all' && i.assignee !== assigneeFilter) return false;
      if (search && !i.title.toLowerCase().includes(search) && !i.desc.toLowerCase().includes(search)) return false;
      return i.status === status;
    });

    if (filtered.length === 0 && (search || typeFilter !== 'all' || priorityFilter !== 'all')) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.textContent = 'No matching issues';
      col.appendChild(noResults);
    }

    filtered.forEach(issue => col.appendChild(createCard(issue)));
  });
  updateCounts();
}

// ===== Detail Panel =====
function openDetailPanel(issueId) {
  const issue = issues.find(i => i.id === issueId);
  if (!issue) return;
  currentDetailIssue = issue;

  const panel = document.getElementById('detail-panel');
  const body = document.getElementById('detail-body');
  const statusBar = document.getElementById('detail-status-bar');

  document.getElementById('detail-title').textContent = `PROJ-${issue.id}: ${issue.title}`;

  body.innerHTML = `
    <div class="detail-field">
      <label>Type</label>
      <div class="value">${typeIcons[issue.type] || '📄'} ${issue.type.charAt(0).toUpperCase() + issue.type.slice(1)}</div>
    </div>
    <div class="detail-field">
      <label>Summary</label>
      <input type="text" id="detail-summary" value="${escapeHtml(issue.title)}">
    </div>
    <div class="detail-field">
      <label>Description</label>
      <textarea id="detail-desc">${escapeHtml(issue.desc || '')}</textarea>
    </div>
    <div class="detail-field">
      <label>Priority</label>
      <select id="detail-priority">
        <option value="high" ${issue.priority === 'high' ? 'selected' : ''}>High</option>
        <option value="medium" ${issue.priority === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="low" ${issue.priority === 'low' ? 'selected' : ''}>Low</option>
      </select>
    </div>
    <div class="detail-field">
      <label>Assignee</label>
      <input type="text" id="detail-assignee" value="${escapeHtml(issue.assignee || '')}">
    </div>
    <div class="comments-section">
      <h3>Comments (${(comments[issue.id] || []).length})</h3>
      <div id="comments-list">
        ${(comments[issue.id] || []).map(c => `
          <div class="comment">
            <div class="comment-header">
              <span class="comment-author">${escapeHtml(c.author)}</span>
              <span class="comment-date">${new Date(c.date).toLocaleString()}</span>
            </div>
            <div class="comment-text">${escapeHtml(c.text)}</div>
          </div>
        `).join('')}
      </div>
      <div class="comment-form">
        <input type="text" id="comment-input" placeholder="Add a comment...">
        <button class="btn btn-primary btn-sm" id="comment-submit">Add</button>
      </div>
    </div>
  `;

  // Wire up save button
  body.querySelector('#detail-summary').addEventListener('change', e => {
    issue.title = e.target.value;
    saveState();
    renderBoard();
  });
  body.querySelector('#detail-desc').addEventListener('change', e => {
    issue.desc = e.target.value;
    saveState();
  });
  body.querySelector('#detail-priority').addEventListener('change', e => {
    issue.priority = e.target.value;
    saveState();
    renderBoard();
  });
  body.querySelector('#detail-assignee').addEventListener('change', e => {
    issue.assignee = e.target.value;
    saveState();
    renderBoard();
  });

  // Wire up comment submit
  document.getElementById('comment-submit').addEventListener('click', addComment);
  document.getElementById('comment-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addComment();
  });

  // Status buttons
  statusBar.innerHTML = ['todo', 'inprogress', 'review', 'done'].map(s => {
    const labels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
    const active = issue.status === s ? 'active' : '';
    return `<button class="detail-status-btn ${active}" data-status="${s}">${labels[s]}</button>`;
  }).join('');

  statusBar.querySelectorAll('.detail-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      issue.status = btn.dataset.status;
      saveState();
      renderBoard();
      openDetailPanel(issue.id); // Refresh panel
    });
  });

  panel.classList.add('open');
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  currentDetailIssue = null;
}

function addComment() {
  if (!currentDetailIssue) return;
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;

  if (!comments[currentDetailIssue.id]) comments[currentDetailIssue.id] = [];
  comments[currentDetailIssue.id].push({
    author: 'You',
    text: text,
    date: new Date().toISOString()
  });
  saveState();
  openDetailPanel(currentDetailIssue.id); // Refresh
  renderBoard(); // Update comment count badge
}

// ===== Drag & Drop =====
function initDragDrop() {
  document.querySelectorAll('.column-body').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over');
      }
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = parseInt(e.dataTransfer.getData('text/plain'));
      const issue = issues.find(i => i.id === id);
      if (issue) {
        issue.status = col.dataset.status;
        renderBoard();
      }
    });
  });
}

// ===== Modal =====
function openModal() {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('issue-title').focus();
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('issue-form').reset();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Ensure default project exists
  if (!projects['default']) {
    projects['default'] = { name: 'Project Alpha', icon: '📋', issues: issues.length > 0 ? issues : [...sampleIssues] };
  }
  // Migrate existing issues into default project
  if (issues.length > 0 && !projects['default'].issues.length) {
    projects['default'].issues = issues;
  }
  // Ensure current project has issues
  if (projects[currentProject] && !projects[currentProject].issues.length) {
    projects[currentProject].issues = issues.length > 0 ? issues : [...sampleIssues];
  }
  // Sync global issues with current project
  if (issues.length === 0 && projects[currentProject].issues.length > 0) {
    issues = projects[currentProject].issues;
  }
  issues = projects[currentProject].issues;

  renderSidebar();
  renderBoard();
  initDragDrop();
  populateAssigneeFilter();

  // Sidebar toggle
  document.getElementById('toggle-sidebar').addEventListener('click', () => {
    document.querySelector('.app-layout').classList.toggle('sidebar-collapsed');
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
    if (projects[key]) { alert('Project key already exists!'); return; }
    createProject(name, key);
    document.getElementById('project-modal-overlay').style.display = 'none';
    document.getElementById('project-form').reset();
  });

  // Save filter button
  document.getElementById('save-filter-btn').addEventListener('click', saveCurrentFilter);

  document.getElementById('add-issue-btn').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (!e.target.closest('.modal')) closeModal();
  });

  document.getElementById('issue-form').addEventListener('submit', e => {
    e.preventDefault();
    issueCounter++;
    const newIssue = {
      id: issueCounter,
      title: document.getElementById('issue-title').value.trim(),
      desc: document.getElementById('issue-desc').value.trim(),
      type: document.getElementById('issue-type').value,
      priority: document.getElementById('issue-priority').value,
      assignee: document.getElementById('issue-assignee').value.trim(),
      status: 'todo',
    };
    issues.push(newIssue);
    saveState();
    renderBoard();
    closeModal();
    addActivity('➕', `Created <strong>PROJ-${newIssue.id}</strong>`);
  });

  // Add card buttons
  document.querySelectorAll('.btn-add-card').forEach(btn => {
    btn.addEventListener('click', () => openModal());
  });

  // Detail panel close
  document.getElementById('detail-close').addEventListener('click', closeDetailPanel);

  // Filter controls
  document.getElementById('search-input').addEventListener('input', applyFilters);
  document.getElementById('filter-type').addEventListener('change', applyFilters);
  document.getElementById('filter-priority').addEventListener('change', applyFilters);
  document.getElementById('filter-assignee').addEventListener('change', applyFilters);
});

function populateAssigneeFilter() {
  const assignees = [...new Set(issues.map(i => i.assignee).filter(Boolean))];
  const select = document.getElementById('filter-assignee');
  select.innerHTML = '<option value="all">All Assignees</option>';
  assignees.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    select.appendChild(opt);
  });
}

// ===== Sidebar =====
function renderSidebar() {
  renderProjects();
  renderViews();
  renderSavedFilters();
  renderActivity();
}

function renderProjects() {
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  Object.entries(projects).forEach(([key, proj]) => {
    const item = document.createElement('div');
    item.className = `project-item${key === currentProject ? ' active' : ''}`;
    item.innerHTML = `
      <span class="project-icon">${proj.icon}</span>
      <span class="project-key">${key.toUpperCase()}</span>
      <span class="project-name">${escapeHtml(proj.name)}</span>
      <button class="project-delete" data-key="${key}" title="Delete project">✕</button>
    `;
    item.querySelector('.project-name').addEventListener('click', () => switchProject(key));
    item.querySelector('.project-icon').addEventListener('click', () => switchProject(key));
    item.querySelector('.project-key').addEventListener('click', () => switchProject(key));
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
    { id: 'board', icon: '📋', label: 'Board' },
    { id: 'list', icon: '📝', label: 'List' },
  ];
  views.forEach(v => {
    const item = document.createElement('div');
    item.className = `view-item${v.id === currentView ? ' active' : ''}`;
    item.innerHTML = `<span class="view-icon">${v.icon}</span><span>${v.label}</span>`;
    item.addEventListener('click', () => switchView(v.id));
    list.appendChild(item);
  });
}

function renderSavedFilters() {
  const list = document.getElementById('saved-filters');
  list.innerHTML = '';
  savedFilters.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'saved-filter-item';
    item.innerHTML = `
      <span class="filter-name">${escapeHtml(f.name)}</span>
      <button class="filter-delete" data-idx="${idx}" title="Delete filter">✕</button>
    `;
    item.querySelector('.filter-name').addEventListener('click', () => applySavedFilter(idx));
    item.querySelector('.filter-delete').addEventListener('click', e => {
      e.stopPropagation();
      savedFilters.splice(idx, 1);
      saveState();
      renderSavedFilters();
    });
    list.appendChild(item);
  });
}

function renderActivity() {
  const feed = document.getElementById('activity-feed');
  feed.innerHTML = '';
  activityLog.slice(0, 15).forEach(a => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    const ago = timeAgo(a.time);
    item.innerHTML = `
      <span class="activity-icon">${a.icon}</span>
      <span class="activity-text">${a.text}</span>
      <span class="activity-time">${ago}</span>
    `;
    feed.appendChild(item);
  });
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function switchProject(key) {
  currentProject = key;
  issues = projects[key].issues;
  renderSidebar();
  renderBoard();
  populateAssigneeFilter();
  document.getElementById('board-title').textContent = `${projects[key].icon} ${projects[key].name} — Board`;
}

function switchView(view) {
  currentView = view;
  renderViews();
  const board = document.getElementById('board');
  if (view === 'list') {
    board.style.display = 'none';
    let listView = document.getElementById('list-view');
    if (!listView) {
      listView = document.createElement('div');
      listView.id = 'list-view';
      listView.className = 'list-view';
      board.after(listView);
    }
    renderListView();
  } else {
    const lv = document.getElementById('list-view');
    if (lv) lv.style.display = 'none';
    board.style.display = 'flex';
  }
}

function renderListView() {
  const container = document.getElementById('list-view');
  const filtered = getFilteredIssues();
  container.innerHTML = `
    <table class="issue-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Key</th>
          <th>Summary</th>
          <th>Priority</th>
          <th>Assignee</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(i => `
          <tr data-id="${i.id}" class="list-row">
            <td>${typeIcons[i.type] || '📄'} ${i.type}</td>
            <td class="issue-key">PROJ-${i.id}</td>
            <td>${escapeHtml(i.title)}</td>
            <td><span class="issue-priority priority-${i.priority}">${i.priority}</span></td>
            <td>${i.assignee || '—'}</td>
            <td>${i.status}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  container.querySelectorAll('.list-row').forEach(row => {
    row.addEventListener('click', () => openDetailPanel(parseInt(row.dataset.id)));
  });
}

function getFilteredIssues() {
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('filter-type')?.value || 'all';
  const priorityFilter = document.getElementById('filter-priority')?.value || 'all';
  const assigneeFilter = document.getElementById('filter-assignee')?.value || 'all';
  return issues.filter(i => {
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
    if (assigneeFilter !== 'all' && i.assignee !== assigneeFilter) return false;
    if (search && !i.title.toLowerCase().includes(search) && !i.desc.toLowerCase().includes(search)) return false;
    return true;
  });
}

function applySavedFilter(idx) {
  const f = savedFilters[idx];
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
    alert('Save a meaningful filter!');
    return;
  }
  savedFilters.push(f);
  saveState();
  renderSavedFilters();
}

function deleteProject(key) {
  if (Object.keys(projects).length <= 1) {
    alert('You must have at least one project.');
    return;
  }
  if (!confirm(`Delete project "${projects[key].name}" and all its issues?`)) return;
  delete projects[key];
  const remaining = Object.keys(projects)[0];
  switchProject(remaining);
  saveState();
}

function createProject(name, key) {
  const icons = ['🚀', '🎯', '⚡', '🔥', '💡', '🌟', '🎨', '🔧'];
  const icon = icons[Math.floor(Math.random() * icons.length)];
  projects[key] = { name, icon, issues: [] };
  switchProject(key);
  saveState();
  addActivity('🆕', `<strong>${name}</strong> project created`);
}

// ===== Init =====
