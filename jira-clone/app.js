// ===== State =====
let issues = [];
let issueCounter = 100;
let currentDetailIssue = null;
let comments = {}; // { issueId: [{ author, text, date }] }

function loadState() {
  const saved = localStorage.getItem('jira-clone-issues');
  const savedComments = localStorage.getItem('jira-clone-comments');
  if (saved) {
    issues = JSON.parse(saved);
    issueCounter = Math.max(...issues.map(i => i.id), 100);
  } else {
    issues = [...sampleIssues];
    issueCounter = 106;
  }
  if (savedComments) comments = JSON.parse(savedComments);
}

function saveState() {
  localStorage.setItem('jira-clone-issues', JSON.stringify(issues));
  localStorage.setItem('jira-clone-comments', JSON.stringify(comments));
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
  renderBoard();
  initDragDrop();
  populateAssigneeFilter();

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
  });

  // Add card buttons
  document.querySelectorAll('.btn-add-card').forEach(btn => {
    btn.addEventListener('click', () => {
      openModal();
    });
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
  assignees.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    select.appendChild(opt);
  });
}
