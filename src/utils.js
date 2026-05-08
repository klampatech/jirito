// ===== Markdown Parser (lightweight) =====

// Allowed URL schemes for markdown links — blocks javascript:, data:, vbscript:, etc.
const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

function isSafeUrl(url) {
  // Strip leading whitespace and newlines
  const trimmed = url.trim().replace(/^\s*\n\s*/g, '');
  // Block empty URLs
  if (!trimmed) return false;
  // Block javascript:, data:, vbscript: and other dangerous schemes
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase() + ':';
    return ALLOWED_URL_SCHEMES.includes(scheme);
  }
  // Relative URLs (no scheme) are safe
  return true;
}

function parseMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Links (with XSS-safe URL filtering)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    if (isSafeUrl(url)) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
    }
    // Unsafe URL — render as plain text, drop the link
    return label;
  });
  // Unordered lists
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // Headers
  html = html.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  // Clean up extra <br> around block elements
  html = html.replace(/<br><(h[2-4]|ul|ol|li|pre|blockquote)/g, '<$1');
  html = html.replace(/<\/(h[2-4]|ul|ol|li|pre|blockquote)><br>/g, '</$1>');
  return html;
}

function renderMarkdown(text) {
  if (!text) return '';
  return parseMarkdown(text);
}

// ===== Calendar Helpers =====
function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay(); // 0=Sun
  const days = [];
  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false, dueIssues: [] });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dueIssues = LJ.issues.filter(i => i.dueDate === dateStr && i.status !== 'done');
    days.push({ date: new Date(year, month, d), isCurrentMonth: true, dateStr, dueIssues });
  }
  // Next month padding
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d);
    days.push({ date, isCurrentMonth: false, dueIssues: [] });
  }
  return days;
}

function getMonthName(month) {
  return new Date(2000, month, 1).toLocaleString('en-US', { month: 'long' });
}

// ===== Icon Helper (Phosphor Icons) =====

function lucideIcon(name, attrs = {}) {
  // Convert PascalCase icon name to kebab-case CSS class (e.g. "Plus" -> "plus", "FileText" -> "file-text")
  const kebabName = name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  const className = 'ph ph-' + kebabName;
  const iconAttrs = Object.entries(attrs)
    .map(([k, v]) => k + '="' + v + '"')
    .join(' ');
  return '<i class="' + className + '" ' + iconAttrs + '></i>';
}

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 0) return 'In the future';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function generateIssueKey(projectKey, id) {
  return `${projectKey.toUpperCase()}-${id}`;
}

function getProjectKey() {
  return LJ.projects[LJ.currentProject]?.key || 'PROJ';
}

function getFilteredIssues() {
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('filter-type')?.value || 'all';
  const priorityFilter = document.getElementById('filter-priority')?.value || 'all';
  const assigneeFilter = document.getElementById('filter-assignee')?.value || 'all';
  return LJ.issues.filter(i => {
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
    if (assigneeFilter !== 'all' && i.assignee !== assigneeFilter) return false;
    if (search && !i.title.toLowerCase().includes(search) && !(i.desc || '').toLowerCase().includes(search)) return false;
    return true;
  });
}

function getAllLabels() {
  const labels = new Set();
  LJ.issues.forEach(i => {
    if (i.labels) i.labels.forEach(l => labels.add(l));
  });
  return [...labels].sort();
}

// ===== Sprint UI Helpers =====
function populateSprintFilter() {
  const select = document.getElementById('sprint-filter');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Sprints</option>';
  Object.values(getSprints()).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
  select.value = currentVal || 'all';
}

function populateSprintSelect() {
  const select = document.getElementById('issue-sprint');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">No Sprint</option>';
  Object.values(getSprints()).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
  select.value = currentVal || '';
}

function updateSprintBar() {
  const sprintFilter = document.getElementById('sprint-filter');
  const manageBtn = document.getElementById('manage-sprints-btn');
  const sprintBar = document.getElementById('sprint-bar');
  if (!sprintFilter || !manageBtn) return;
  const sprints = getSprints();
  const sprintCount = Object.keys(sprints).length;
  // Always show the manage button (users need to create sprints)
  manageBtn.style.display = 'inline-flex';
  if (sprintCount > 0) {
    sprintFilter.style.display = 'inline-block';
    populateSprintFilter();
    // Show sprint bar if a sprint is active
    const activeSprint = getActiveSprint();
    if (activeSprint) {
      sprintBar.style.display = 'block';
      document.getElementById('sprint-bar-name').textContent = activeSprint.name;
      updateSprintProgressBar(activeSprint);
    } else {
      sprintBar.style.display = 'none';
    }
  } else {
    sprintFilter.style.display = 'none';
    sprintBar.style.display = 'none';
  }
}

function updateSprintProgressBar(activeSprint) {
  const fill = document.getElementById('sprint-progress-fill');
  const text = document.getElementById('sprint-progress-text');
  if (!fill || !text) return;
  const sprintIssues = LJ.issues.filter(i => i.sprint === activeSprint.id);
  const totalSP = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const doneSP = sprintIssues.filter(i => i.status === 'done').reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const pct = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
  fill.style.width = pct + '%';
  text.textContent = doneSP + '/' + totalSP + ' points';
}

function updateSprintProgress() {
  const activeSprint = getActiveSprint();
  if (activeSprint) {
    updateSprintProgressBar(activeSprint);
  }
}

// ===== Undo helpers =====
function undoDeleteIssue(issue) {
  LJ.issues.push(issue);
  saveState();
  renderBoard();
  updateCounts();
  removeUndoToast();
  showToast('Issue restored', 'success');
}

function undoMoveIssue(issueId, oldStatus) {
  const issue = LJ.issues.find(i => i.id === issueId);
  if (issue) {
    issue.status = oldStatus;
    saveState();
    renderBoard();
    updateCounts();
    removeUndoToast();
    showToast('Status restored', 'success');
  }
}
