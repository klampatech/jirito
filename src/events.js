// ===== Event Handlers =====

// Constants loaded via <script src="src/constants.js"> in index.html
const HISTORY_MAX_ENTRIES = LJ_CONSTANTS.HISTORY_MAX_ENTRIES;
const DEP_SEARCH_DEBOUNCE_MS = LJ_CONSTANTS.DEP_SEARCH_DEBOUNCE_MS;

// ===== Detail Panel =====
let _detailChangeHandler = null;
let _detailCommentClickHandler = null;
let _detailCommentKeydownHandler = null;

function openDetailPanel(issueId) {
  const issue = getIssues().find(i => i.id === issueId);
  if (!issue) return;
  setCurrentDetailIssue(issue);

  const panel = document.getElementById('detail-panel');
  const body = document.getElementById('detail-body');
  const statusBar = document.getElementById('detail-status-bar');

  const projectKey = getProjectKey();
  const key = generateIssueKey(projectKey, issue.id);

  document.getElementById('detail-title').textContent = `${key}: ${issue.title}`;

  // Build labels HTML
  let labelsHtml = '';
  if (issue.labels && issue.labels.length > 0) {
    labelsHtml = `<div class="detail-labels">${issue.labels.map(l => `<span class="issue-label">${escapeHtml(l)}</span>`).join('')}</div>`;
  }

  // Build history HTML
  let historyHtml = '';
  if (issue.history && issue.history.length > 0) {
    historyHtml = issue.history.slice(-HISTORY_MAX_ENTRIES).reverse().map(h => `
      <div class="history-entry">
        <span class="history-field">${escapeHtml(h.field)}</span>
        <span class="history-arrow">→</span>
        <span class="history-from">${escapeHtml(h.from || '—')}</span>
        <span class="history-to">${escapeHtml(h.to)}</span>
        <span class="history-date">${new Date(h.date).toLocaleString()}</span>
      </div>
    `).join('');
  }

  body.innerHTML = `
    <div class="detail-field">
      <label>Type</label>
      <div class="value">${lucideIcon(typeIcons[issue.type] || 'File', {class:'icon'})} ${escapeHtml(issue.type.charAt(0).toUpperCase() + issue.type.slice(1))}</div>
    </div>
    <div class="detail-field">
      <label>Summary</label>
      <input type="text" id="detail-summary" value="${escapeHtml(issue.title)}">
    </div>
    <div class="detail-field">
      <label>Description</label>
      <div class="markdown-editor">
        <div class="markdown-editor-toolbar">
          <button class="btn btn-sm btn-format" data-format="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
          <button class="btn btn-sm btn-format" data-format="italic" title="Italic (Ctrl+I)"><em>I</em></button>
          <button class="btn btn-sm btn-format" data-format="link" title="Insert link">🔗</button>
          <button class="btn btn-sm btn-format" data-format="code" title="Inline code">&lt;&gt;</button>
          <button class="btn btn-sm btn-format" data-format="codeblock" title="Code block">▤</button>
          <button class="btn btn-sm btn-markdown-toggle" data-target="detail-desc" data-issue-id="${issue.id}" title="Toggle markdown preview">
            ${lucideIcon('Eye', {class:'icon-sm'})} Preview
          </button>
          <button class="btn btn-sm btn-markdown-help" title="Markdown syntax help">
            ${lucideIcon('Question', {class:'icon-sm'})}
          </button>
        </div>
        <textarea id="detail-desc" class="markdown-textarea">${escapeHtml(issue.desc || '')}</textarea>
        <div id="detail-desc-preview" class="markdown-preview" style="display:none;"></div>
      </div>
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
    <div class="detail-field">
      <label>Labels</label>
      <input type="text" id="detail-labels" value="${(issue.labels || []).join(', ')}" placeholder="Comma-separated labels">
    </div>
    <div class="detail-field">
      <label>Due Date</label>
      <input type="date" id="detail-due-date" value="${issue.dueDate || ''}">
    </div>
    <div class="detail-field">
      <label>Story Points</label>
      <input type="number" id="detail-story-points" min="0" max="100" value="${issue.storyPoints || ''}" placeholder="0">
    </div>
    <div class="detail-field">
      <label>Sprint</label>
      <select id="detail-sprint">
        <option value="">No Sprint</option>
        ${Object.values(getSprints()).map(s => `<option value="${s.id}" ${issue.sprint === s.id ? 'selected' : ''}>${escapeHtml(s.name)} (${formatDate(s.startDate)} - ${formatDate(s.endDate)})</option>`).join('')}
      </select>
    </div>
    <div class="detail-field">
      <label>Dependencies</label>
      <div id="detail-dependencies">
        ${(issue.dependencies || []).map(d => {
          const target = getIssues().find(i => i.id === d.targetId);
          const targetKey = target ? generateIssueKey(getProjectKey(), target.id) : 'Unknown';
          const typeIcon = d.type === 'blocks' ? 'TriangleAlert' : 'Link';
          return `<div class="dep-entry">
            ${lucideIcon(typeIcon, {class:'icon-sm'})}
            <span class="dep-key">${targetKey}</span>
            <span class="dep-type">${d.type === 'blocks' ? 'blocks' : 'relates to'}</span>
            <button class="dep-remove" data-target-id="${d.targetId}" data-type="${d.type}" title="Remove dependency">&times;</button>
          </div>`;
        }).join('')}
        ${(!issue.dependencies || issue.dependencies.length === 0) ? '<span class="history-empty">No dependencies</span>' : ''}
      </div>
      <input type="text" id="dep-search" placeholder="Search issues (e.g. PROJ-101)...">
      <div class="dep-add-row">
        <select id="dep-type">
          <option value="relates-to">Relates to</option>
          <option value="blocks">Blocks</option>
        </select>
        <button class="btn btn-secondary btn-sm" id="dep-add-btn">Add</button>
      </div>
      <div id="dep-search-results" style="display:none;"></div>
    </div>
    <div class="detail-field">
      <label>History</label>
      <div class="history-list">${historyHtml || '<span class="history-empty">No changes yet</span>'}</div>
    </div>
    <div class="comments-section">
      <h3>Comments (${(getComments()[issue.id] || []).length})</h3>
      <div id="comments-list">
        ${(getComments()[issue.id] || []).map(c => `
          <div class="comment">
            <div class="comment-header">
              <span class="comment-author">${escapeHtml(c.author)}</span>
              <span class="comment-date">${new Date(c.date).toLocaleString()}</span>
            </div>
            <div class="comment-text markdown-content">${renderMarkdown(c.text)}</div>
          </div>
        `).join('')}
      </div>
      <div class="markdown-editor">
        <div class="markdown-editor-toolbar">
          <button class="btn btn-sm btn-format" data-format="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
          <button class="btn btn-sm btn-format" data-format="italic" title="Italic (Ctrl+I)"><em>I</em></button>
          <button class="btn btn-sm btn-format" data-format="link" title="Insert link">🔗</button>
          <button class="btn btn-sm btn-format" data-format="code" title="Inline code">&lt;&gt;</button>
          <button class="btn btn-sm btn-format" data-format="codeblock" title="Code block">▤</button>
          <button class="btn btn-sm btn-markdown-toggle" data-target="comment-input" data-issue-id="${issue.id}" title="Toggle markdown preview">
            ${lucideIcon('Eye', {class:'icon-sm'})} Preview
          </button>
          <button class="btn btn-sm btn-markdown-help" title="Markdown syntax help">
            ${lucideIcon('Question', {class:'icon-sm'})}
          </button>
        </div>
        <textarea id="comment-input" class="markdown-textarea" placeholder="Add a comment... (supports Markdown)"></textarea>
        <div id="comment-input-preview" class="markdown-preview" style="display:none;"></div>
        <button class="btn btn-primary btn-sm" id="comment-submit">Add</button>
      </div>
    </div>
  `;

  // Remove previous change handler to prevent duplicates
  if (_detailChangeHandler) {
    body.removeEventListener('change', _detailChangeHandler);
  }
  // Wire up save button using event delegation to avoid duplicate listeners
  _detailChangeHandler = e => {
    const target = e.target;
    if (target.id === 'detail-summary') {
      const oldTitle = issue.title;
      trackHistory(issue, 'title', oldTitle, target.value);
      issue.title = target.value;
      saveState();
      renderBoard();
      document.getElementById('detail-title').textContent = `${key}: ${target.value}`;
      showUndoToast('Summary changed', () => {
        issue.title = oldTitle;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Summary restored', 'success');
      });
    } else if (target.id === 'detail-desc') {
      const oldDesc = issue.desc || '';
      trackHistory(issue, 'description', oldDesc, target.value);
      issue.desc = target.value;
      saveState();
      showUndoToast('Description changed', () => {
        issue.desc = oldDesc;
        saveState();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Description restored', 'success');
      });
    } else if (target.id === 'detail-priority') {
      const oldPriority = issue.priority;
      trackHistory(issue, 'priority', oldPriority, target.value);
      issue.priority = target.value;
      saveState();
      renderBoard();
      showUndoToast('Priority changed', () => {
        issue.priority = oldPriority;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Priority restored', 'success');
      });
    } else if (target.id === 'detail-assignee') {
      const oldAssignee = issue.assignee || '';
      trackHistory(issue, 'assignee', oldAssignee, target.value);
      issue.assignee = target.value;
      saveState();
      renderBoard();
      showUndoToast('Assignee changed', () => {
        issue.assignee = oldAssignee;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Assignee restored', 'success');
      });
    } else if (target.id === 'detail-labels') {
      const oldLabels = (issue.labels || []).join(', ');
      const labels = target.value.split(',').map(l => l.trim()).filter(Boolean);
      trackHistory(issue, 'labels', oldLabels, labels.join(', '));
      issue.labels = labels;
      saveState();
      renderBoard();
      showUndoToast('Labels changed', () => {
        issue.labels = oldLabels ? oldLabels.split(',').map(l => l.trim()).filter(Boolean) : [];
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Labels restored', 'success');
      });
    } else if (target.id === 'detail-due-date') {
      const oldDate = issue.dueDate;
      issue.dueDate = target.value || null;
      if (oldDate !== issue.dueDate) {
        trackHistory(issue, 'due date', oldDate || 'None', issue.dueDate || 'None');
      }
      saveState();
      renderBoard();
      showUndoToast('Due date changed', () => {
        issue.dueDate = oldDate;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Due date restored', 'success');
      });
    } else if (target.id === 'detail-story-points') {
      const oldSP = issue.storyPoints;
      issue.storyPoints = target.value ? parseInt(target.value) : null;
      if (oldSP !== issue.storyPoints) {
        trackHistory(issue, 'story points', oldSP || '0', issue.storyPoints || '0');
      }
      saveState();
      renderBoard();
      showUndoToast('Story points changed', () => {
        issue.storyPoints = oldSP;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Story points restored', 'success');
      });
    } else if (target.id === 'detail-sprint') {
      const oldSprint = issue.sprint;
      issue.sprint = target.value || null;
      if (oldSprint !== issue.sprint) {
        trackHistory(issue, 'sprint', oldSprint || 'None', issue.sprint || 'None');
      }
      saveState();
      renderBoard();
      showUndoToast('Sprint changed', () => {
        issue.sprint = oldSprint;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Sprint restored', 'success');
      });
    }
  };
  body.addEventListener('change', _detailChangeHandler);

  // Remove previous comment handlers to prevent duplicates
  const prevCommentSubmit = body.querySelector('#comment-submit');
  const prevCommentInput = body.querySelector('#comment-input');
  if (_detailCommentClickHandler && prevCommentSubmit) {
    prevCommentSubmit.removeEventListener('click', _detailCommentClickHandler);
  }
  if (_detailCommentKeydownHandler && prevCommentInput) {
    prevCommentInput.removeEventListener('keydown', _detailCommentKeydownHandler);
  }
  // Wire up comment submit using event delegation
  _detailCommentClickHandler = addComment;
  _detailCommentKeydownHandler = e => {
    if (e.key === 'Enter') addComment();
  };
  if (prevCommentSubmit) {
    prevCommentSubmit.addEventListener('click', _detailCommentClickHandler);
  }
  if (prevCommentInput) {
    prevCommentInput.addEventListener('keydown', _detailCommentKeydownHandler);
  }

  // Status buttons
  statusBar.innerHTML = ['todo', 'inprogress', 'review', 'done'].map(s => {
    const labels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
    const active = issue.status === s ? 'active' : '';
    return `<button class="detail-status-btn ${active}" data-status="${s}">${labels[s]}</button>`;
  }).join('');

  statusBar.querySelectorAll('.detail-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const oldStatus = issue.status;
      issue.status = btn.dataset.status;
      trackHistory(issue, 'status', oldStatus, btn.dataset.status);
      saveState();
      renderBoard();
      openDetailPanel(issue.id); // Refresh panel
      const statusLabels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
      showUndoToast(`Moved to ${statusLabels[btn.dataset.status]}`, () => {
        issue.status = oldStatus;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast('Status restored', 'success');
      });
    });
  });

  // Clone button
  const deleteBtn = document.getElementById('delete-issue-btn');
  const cloneBtn = document.getElementById('clone-issue-btn');
  if (cloneBtn) {
    cloneBtn.style.display = 'inline-flex';
    cloneBtn.addEventListener('click', () => cloneIssue(issueId));
  }

  // Delete button
  deleteBtn.addEventListener('click', () => deleteIssue(issueId));

  // Dependency removal
  const depContainer = document.getElementById('detail-dependencies');
  if (depContainer) {
    depContainer.querySelectorAll('.dep-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const targetId = parseInt(btn.dataset.targetId);
        const type = btn.dataset.type;
        removeDependency(issueId, targetId, type);
        showToast('Dependency removed', 'success');
        openDetailPanel(issueId);
      });
    });
  }

  // Dependency search
  const depSearch = document.getElementById('dep-search');
  const depAddBtn = document.getElementById('dep-add-btn');
  const depResults = document.getElementById('dep-search-results');
  if (depSearch && depAddBtn && depResults) {
    let searchTimeout;
    depSearch.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = depSearch.value.trim().toUpperCase();
        if (!query) { depResults.style.display = 'none'; return; }
        const matches = getIssues().filter(i => {
          if (i.id === issueId) return false;
          const key = generateIssueKey(getProjectKey(), i.id);
          const titleMatch = (i.title || '').toUpperCase().includes(query);
          const keyMatch = key.toUpperCase().includes(query);
          return titleMatch || keyMatch;
        }).slice(0, 10);
        if (matches.length === 0) { depResults.style.display = 'none'; return; }
        depResults.innerHTML = matches.map(m => {
          const key = generateIssueKey(getProjectKey(), m.id);
          return `<div class="dep-result-item" data-id="${m.id}">${key}: ${escapeHtml(m.title)}</div>`;
        }).join('');
        depResults.style.display = 'block';
        depResults.querySelectorAll('.dep-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const targetId = parseInt(item.dataset.id);
            const type = document.getElementById('dep-type').value;
            if (hasCircularDependency(issueId, targetId)) {
              showToast('Cannot add: would create a circular dependency', 'error');
              return;
            }
            addDependency(issueId, targetId, type);
            showToast(`Depended on ${generateIssueKey(getProjectKey(), targetId)}`, 'success');
            depSearch.value = '';
            depResults.style.display = 'none';
            openDetailPanel(issueId);
          });
        });
      }, DEP_SEARCH_DEBOUNCE_MS);
    });
    depAddBtn.addEventListener('click', () => {
      const query = depSearch.value.trim().toUpperCase();
      if (!query) return;
      const match = getIssues().find(i => {
        const key = generateIssueKey(getProjectKey(), i.id).toUpperCase();
        return key.includes(query) && i.id !== issueId;
      });
      if (match) {
        const type = document.getElementById('dep-type').value;
        if (hasCircularDependency(issueId, match.id)) {
          showToast('Cannot add: would create a circular dependency', 'error');
          return;
        }
        addDependency(issueId, match.id, type);
        showToast(`Depended on ${generateIssueKey(getProjectKey(), match.id)}`, 'success');
        depSearch.value = '';
        depResults.style.display = 'none';
        openDetailPanel(issueId);
      }
    });
  }

  panel.classList.add('open');

  // Show backdrop
  const backdrop = document.getElementById('detail-backdrop');
  if (backdrop) {
    backdrop.style.display = 'block';
    // Force reflow for transition
    backdrop.offsetHeight;
    backdrop.classList.add('visible');
  }

  // Render Phosphor icons in the detail panel

  // Initialize markdown toggles
  initMarkdownToggles();
}

function trackHistory(issue, field, from, to) {
  if (!issue.history) issue.history = [];
  issue.history.push({
    field,
    from: String(from),
    to: String(to),
    date: new Date().toISOString(),
    user: 'You'
  });
  // Limit history to last HISTORY_MAX_ENTRIES entries
  if (issue.history.length > HISTORY_MAX_ENTRIES) {
    issue.history = issue.history.slice(-HISTORY_MAX_ENTRIES);
  }
  saveState();
}

function deleteIssue(issueId) {
  if (!confirm('Delete this issue? You can restore it from Trash.')) return;
  const idx = getIssues().findIndex(i => i.id === issueId);
  if (idx === -1) return;
  const title = getIssues()[idx].title;
  const issue = getIssues().splice(idx, 1)[0];
  delete getComments()[issueId];
  // Move to trash instead of deleting
  moveToTrash(issue);
  addActivity(`Trash`, `Deleted issue: ${title}`);
  closeDetailPanel();
  renderBoard();
  updateCounts();
  renderTrash();
  showToast('Issue moved to trash', 'success');
  // Wire up undo
  showUndoToast('Issue deleted', () => {
    getIssues().push(issue);
    getComments()[issueId] = getComments()[issueId] || [];
    saveState();
    renderBoard();
    updateCounts();
    removeUndoToast();
    showToast('Issue restored', 'success');
  });
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-backdrop').classList.remove('visible');
  document.getElementById('detail-backdrop').style.display = 'none';
  setCurrentDetailIssue(null);
}

function addComment() {
  if (!getCurrentDetailIssue()) return;
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;

  if (!getComments()[getCurrentDetailIssue().id]) getComments()[getCurrentDetailIssue().id] = [];
  const commentIdx = getComments()[getCurrentDetailIssue().id].length;
  getComments()[getCurrentDetailIssue().id].push({
    author: 'You',
    text: text,
    date: new Date().toISOString()
  });
  saveState();
  openDetailPanel(getCurrentDetailIssue().id); // Refresh
  renderBoard(); // Update comment count badge
  const issueId = getCurrentDetailIssue().id;
  showUndoToast('Comment added', () => {
    getComments()[issueId].splice(commentIdx, 1);
    saveState();
    openDetailPanel(issueId);
    renderBoard();
    removeUndoToast();
    showToast('Comment removed', 'success');
  });
}

// ===== Markdown Toggle =====
function initMarkdownToggles() {
  // Quick format buttons
  document.querySelectorAll('.btn-format').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const format = btn.dataset.format;
      const textarea = btn.closest('.markdown-editor, .comment-form').querySelector('textarea');
      if (!textarea) return;
      textarea.focus();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.substring(start, end);
      let replacement = '';
      switch (format) {
        case 'bold':
          replacement = '**' + (selected || 'bold text') + '**';
          break;
        case 'italic':
          replacement = '*' + (selected || 'italic text') + '*';
          break;
        case 'link':
          replacement = '[' + (selected || 'link text') + '](url)';
          break;
        case 'code':
          replacement = '`' + (selected || 'code') + '`';
          break;
        case 'codeblock':
          replacement = '```\n' + (selected || 'code here') + '\n```';
          break;
      }
      textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  });

  document.querySelectorAll('.btn-markdown-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      const textarea = document.getElementById(targetId);
      const previewId = targetId + '-preview';
      const preview = document.getElementById(previewId);
      if (!textarea || !preview) return;

      if (preview.style.display === 'none') {
        preview.innerHTML = renderMarkdown(textarea.value);
        preview.style.display = 'block';
        textarea.style.display = 'none';
        btn.innerHTML = lucideIcon('Pencil', {class:'icon-sm'}) + ' Edit';
      } else {
        preview.style.display = 'none';
        textarea.style.display = 'block';
        btn.innerHTML = lucideIcon('Eye', {class:'icon-sm'}) + ' Preview';
      }
    });
  });

  // Markdown help tooltip
  document.querySelectorAll('.btn-markdown-help').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const help = document.createElement('div');
      help.className = 'markdown-help-tooltip';
      help.innerHTML = `
        <strong>Markdown Syntax</strong><br>
        <code>**bold**</code> → <strong>bold</strong><br>
        <code>*italic*</code> → <em>italic</em><br>
        <code>~~strikethrough~~</code> → <del>strikethrough</del><br>
        <code>\`inline code\`</code> → inline code<br>
        <code>\`\`\`code block\`\`\`</code> → code block<br>
        <code>[text](url)</code> → link<br>
        <code>- list item</code> → bullet list<br>
        <code># Header</code> → heading
      `;
      help.style.cssText = 'position:absolute;top:100%;right:0;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:12px;z-index:70;box-shadow:0 4px 12px var(--shadow);max-width:280px;line-height:1.6;';
      const parent = btn.closest('.markdown-editor-toolbar, .comment-form-toolbar');
      if (parent) {
        parent.style.position = 'relative';
        parent.appendChild(help);
      }
      setTimeout(() => {
        const closeHelp = (ev) => {
          if (!help.contains(ev.target)) {
            help.remove();
            document.removeEventListener('click', closeHelp);
          }
        };
        document.addEventListener('click', closeHelp);
      }, 10);
    });
  });
}

function cloneIssue(issueId) {
  const issue = getIssues().find(i => i.id === issueId);
  if (!issue) return;
  const newId = getIssueCounter() + 1;
  setIssueCounter(newId);
  const newIssue = {
    id: newId,
    title: issue.title + ' (clone)',
    desc: issue.desc || '',
    type: issue.type,
    priority: issue.priority,
    assignee: issue.assignee,
    status: 'todo',
    dueDate: issue.dueDate,
    labels: [...(issue.labels || [])],
    storyPoints: issue.storyPoints,
    sprint: issue.sprint,
    dependencies: [],
    rank: getIssues().length,
    history: [],
  };
  getIssues().push(newIssue);
  saveState();
  renderBoard();
  updateCounts();
  const projectKey = getProjectKey();
  const newKey = generateIssueKey(projectKey, newIssue.id);
  addActivity('copy', `Cloned issue to <strong>${newKey}</strong>`);
  showToast(`Issue cloned as ${newKey}`, 'success');
  openDetailPanel(newIssue.id);
  showUndoToast(`Cloned to ${newKey}`, () => {
    const idx = getIssues().findIndex(i => i.id === newIssue.id);
    if (idx !== -1) {
      getIssues().splice(idx, 1);
      delete getComments()[newIssue.id];
      saveState();
      renderBoard();
      updateCounts();
      renderTrash();
    }
    removeUndoToast();
    showToast('Clone deleted', 'success');
  });
}

// ===== Drag & Drop =====
function initDragDrop() {
  // Remove existing listeners by cloning column-bodies
  document.querySelectorAll('.column-body').forEach(col => {
    const newCol = col.cloneNode(true);
    col.parentNode.replaceChild(newCol, col);
  });
  // Re-attach card click handlers via event delegation on column-body
  document.querySelectorAll('.column-body').forEach(col => {
    col.addEventListener('click', e => {
      const card = e.target.closest('.issue-card');
      if (!card || card.classList.contains('dragging')) return;
      const id = parseInt(card.dataset.id);
      if (id) openDetailPanel(id);
    });
    col.addEventListener('keydown', e => {
      const card = e.target.closest('.issue-card');
      if (!card) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = parseInt(card.dataset.id);
        if (id) openDetailPanel(id);
      }
    });
    // Re-attach checkbox change handler via event delegation
    col.addEventListener('change', e => {
      const checkbox = e.target.closest('.issue-checkbox');
      if (!checkbox) return;
      const id = parseInt(checkbox.dataset.id);
      if (checkbox.checked) getSelectedIds().add(id);
      else getSelectedIds().delete(id);
      updateBulkBar();
    });
  });
  // Re-attach drag events via event delegation on column-body
  document.querySelectorAll('.column-body').forEach(col => {
    let draggedId = null;
    let draggedCard = null;
    col.addEventListener('dragstart', e => {
      const card = e.target.closest('.issue-card');
      if (!card) return;
      draggedId = card.dataset.id;
      draggedCard = card;
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', String(card.dataset.id));
      e.dataTransfer.effectAllowed = 'move';
    });
    col.addEventListener('dragend', e => {
      const card = e.target.closest('.issue-card');
      if (card) card.classList.remove('dragging');
      col.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
      col.classList.remove('drag-over');
      draggedId = null;
      draggedCard = null;
    });
  });
  document.querySelectorAll('.column-body').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
      // Highlight drop target card
      const card = e.target.closest('.issue-card');
      document.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
      if (card && !card.classList.contains('dragging')) {
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        indicator.style.cssText = 'height:3px;background:var(--primary);border-radius:2px;margin:2px 0;';
        const rect = card.getBoundingClientRect();
        const colRect = col.getBoundingClientRect();
        const midY = rect.top + rect.height / 2 - colRect.top + col.scrollTop;
        indicator.style.top = (e.clientY - colRect.top + col.scrollTop - 1.5) + 'px';
        indicator.style.left = '8px';
        indicator.style.right = '8px';
        indicator.style.position = 'absolute';
        indicator.style.zIndex = '10';
        col.style.position = 'relative';
        col.appendChild(indicator);
      }
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over');
        col.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
      }
    });
    col.addEventListener('dragend', e => {
      col.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      col.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
      const id = parseInt(e.dataTransfer.getData('text/plain'));
      const issue = getIssues().find(i => i.id === id);
      if (!issue) return;

      const droppedOnCard = e.target.closest('.issue-card');
      const colId = col.dataset.colId;
      const colDef = getEffectiveColumns().find(c => c.id === colId);
      const newStatus = colDef?.status || col.dataset.status;
      const oldStatus = issue.status;

      // Check if dropped in same column (reorder) or different column (move)
      const sameColumn = colDef && colDef.status && issue.status === newStatus;

      if (sameColumn) {
        // Reorder within same column
        const oldRank = issue.rank;
        if (droppedOnCard) {
          const targetId = parseInt(droppedOnCard.dataset.id);
          const targetIssue = getIssues().find(i => i.id === targetId);
          if (targetIssue && targetIssue.status === newStatus && targetIssue.id !== issue.id) {
            const siblings = getIssues().filter(i => i.status === newStatus && i.id !== issue.id);
            const targetRank = targetIssue.rank;
            const beforeRank = siblings.filter(i => i.rank < targetRank).length > 0
              ? Math.max(...siblings.filter(i => i.rank < targetRank).map(i => i.rank))
              : -1;
            const afterRank = siblings.filter(i => i.rank > targetRank).length > 0
              ? Math.min(...siblings.filter(i => i.rank > targetRank).map(i => i.rank))
              : targetRank + 1;
            const dropAbove = e.clientY < droppedOnCard.getBoundingClientRect().top + droppedOnCard.getBoundingClientRect().height / 2;
            issue.rank = dropAbove ? beforeRank : targetRank;
          } else {
            issue.rank = (getIssues().filter(i => i.status === newStatus).reduce((max, i) => Math.max(max, i.rank ?? 0), -1)) + 1;
          }
        } else {
          issue.rank = (getIssues().filter(i => i.status === newStatus).reduce((max, i) => Math.max(max, i.rank ?? 0), -1)) + 1;
        }
        saveState();
        renderBoard();
        updateCounts();
        showUndoToast('Card reordered', () => {
          issue.rank = oldRank;
          saveState();
          renderBoard();
          updateCounts();
          removeUndoToast();
          showToast('Reorder undone', 'success');
        });
      } else {
        // Move to different column
        const oldRank = issue.rank;
        // Calculate new rank based on drop position
        if (droppedOnCard) {
          const targetId = parseInt(droppedOnCard.dataset.id);
          const targetIssue = getIssues().find(i => i.id === targetId);
          if (targetIssue && targetIssue.status === newStatus) {
            const siblings = getIssues().filter(i => i.status === newStatus && i.id !== issue.id);
            const targetRank = targetIssue.rank;
            const beforeRank = siblings.filter(i => i.rank < targetRank).length > 0
              ? Math.max(...siblings.filter(i => i.rank < targetRank).map(i => i.rank))
              : -1;
            const afterRank = siblings.filter(i => i.rank > targetRank).length > 0
              ? Math.min(...siblings.filter(i => i.rank > targetRank).map(i => i.rank))
              : targetRank + 1;
            issue.rank = (beforeRank + targetRank) / 2;
          } else {
            issue.rank = (getIssues().filter(i => i.status === newStatus).reduce((max, i) => Math.max(max, i.rank ?? 0), -1)) + 1;
          }
        } else {
          issue.rank = (getIssues().filter(i => i.status === newStatus).reduce((max, i) => Math.max(max, i.rank ?? 0), -1)) + 1;
        }
        issue.status = newStatus;
        trackHistory(issue, 'status', oldStatus, newStatus);
        saveState();
        renderBoard();
        updateCounts();
        const statusLabels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
        showUndoToast(`Moved to ${statusLabels[newStatus]}`, () => {
          issue.status = oldStatus;
          issue.rank = oldRank;
          saveState();
          renderBoard();
          updateCounts();
          removeUndoToast();
          showToast('Status restored', 'success');
        });
      }
    });
  });
}

// ===== Bulk Actions =====
function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const sel = getSelectedIds();
  if (sel.size === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  document.getElementById('bulk-count').textContent = `${sel.size} selected`;
}

function handleBulkStatusChange(e) {
  const status = e.target.value;
  if (!status) return;
  const movedIssues = [];
  getIssues().forEach(i => {
    if (getSelectedIds().has(i.id)) {
      trackHistory(i, 'status', i.status, status);
      i.status = status;
      movedIssues.push({ id: i.id, oldStatus: i.status });
    }
  });
  getSelectedIds().clear();
  saveState();
  renderBoard();
  updateCounts();
  updateBulkBar();
  // Wire up undo
  showUndoToast(`${movedIssues.length} issues moved`, () => {
    movedIssues.forEach(m => {
      const issue = getIssues().find(i => i.id === m.id);
      if (issue) {
        issue.status = m.oldStatus;
        trackHistory(issue, 'status', status, m.oldStatus);
      }
    });
    saveState();
    renderBoard();
    updateCounts();
    removeUndoToast();
    showToast('Status restored', 'success');
  });
}

function handleBulkDelete() {
  if (!confirm(`Delete ${getSelectedIds().size} issues?`)) return;
  const titles = [];
  const deletedIssues = [];
  setIssues(getIssues().filter(i => {
    if (getSelectedIds().has(i.id)) {
      titles.push(i.title);
      deletedIssues.push(i);
      moveToTrash(i);
      delete getComments()[i.id];
      return false;
    }
    return true;
  }));
  // Clean up bulk selection
  getSelectedIds().clear();
  saveState();
  addActivity(`Trash`, `Deleted ${titles.length} issues`);
  renderBoard();
  updateCounts();
  updateBulkBar();
  showToast(`${titles.length} issues moved to trash`, 'success');
  // Wire up undo
  showUndoToast(`${titles.length} issues deleted`, () => {
    deletedIssues.forEach(i => getIssues().push(i));
    saveState();
    renderBoard();
    updateCounts();
    removeUndoToast();
    showToast('Issues restored', 'success');
  });
}

function handleBulkClear() {
  getSelectedIds().clear();
  document.querySelectorAll('.issue-checkbox').forEach(cb => cb.checked = false);
  updateBulkBar();
}

// ===== Filter =====
function applyFilters() {
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('filter-type')?.value || 'all';
  const priorityFilter = document.getElementById('filter-priority')?.value || 'all';
  const assigneeFilter = document.getElementById('filter-assignee')?.value || 'all';
  const sprintFilter = document.getElementById('sprint-filter')?.value || 'all';
  const columns = getEffectiveColumns();

  columns.forEach(colDef => {
    const colBody = document.querySelector(`.column-body[data-col-id="${colDef.id}"]`);
    if (!colBody) return;
    const status = colDef.status || colDef.id;
    colBody.innerHTML = '';
    let filtered = getIssues().filter(i => {
      if (typeFilter !== 'all' && i.type !== typeFilter) return false;
      if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all' && i.assignee !== assigneeFilter) return false;
      if (sprintFilter !== 'all' && i.sprint !== sprintFilter) return false;
      if (search && !i.title.toLowerCase().includes(search) && !(i.desc || '').toLowerCase().includes(search)) return false;
      if (colDef.status && i.status !== colDef.status) return false;
      return true;
    });
    // Sort by rank (custom ordering)
    filtered.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

    if (filtered.length === 0 && (search || typeFilter !== 'all' || priorityFilter !== 'all')) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.textContent = 'No matching issues';
      colBody.appendChild(noResults);
    }

    filtered.forEach(issue => colBody.appendChild(createCard(issue)));
  });
  updateCounts();
  // Also update list view when filters change
  if (getCurrentView() === 'list') {
    renderListView();
  }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;
    background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
    color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 200;
    animation: toastIn 0.3s ease;
  `;
  toast.setAttribute('role', 'alert');
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== Undo Toast =====
let currentUndoCallback = null;
let undoToast = null;

// Event delegation on document.body for undo button to avoid stale listeners
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.target.id === 'undo-btn' && currentUndoCallback) {
      currentUndoCallback();
      removeUndoToast();
    }
  });
}

function showUndoToast(message, onUndo) {
  if (undoToast) undoToast.remove();
  currentUndoCallback = onUndo;
  const toast = document.createElement('div');
  toast.className = 'toast toast-undo';
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; border-radius: 8px; font-size: 14px;
    background: var(--bg-card); color: var(--text); box-shadow: 0 4px 12px var(--shadow);
    z-index: 200; display: flex; align-items: center; gap: 12px;
  `;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span>${message}</span>
    <button class="btn btn-sm" style="background:var(--primary);color:#fff;border:none;cursor:pointer;" id="undo-btn">Undo</button>
  `;
  document.body.appendChild(toast);
  undoToast = toast;
  setTimeout(() => {
    if (undoToast === toast) {
      toast.remove();
      undoToast = null;
      currentUndoCallback = null;
    }
  }, 30000);
}

function removeUndoToast() {
  if (undoToast) {
    undoToast.remove();
    undoToast = null;
  }
  currentUndoCallback = null;
}

// ===== Sprint List Rendering =====
function renderSprintList() {
  const container = document.getElementById('sprint-list');
  if (!container) return;
  const sprints = getSprints();
  const entries = Object.values(sprints).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  if (entries.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No sprints yet. Create one above.</p>';
    return;
  }
  container.innerHTML = entries.map(s => {
    const active = getActiveSprint()?.id === s.id;
    const now = new Date();
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    const isPast = now > end;
    const isFuture = now < start;
    const statusClass = active ? 'active' : isPast ? 'past' : isFuture ? 'future' : '';
    const statusLabel = active ? '● Active' : isPast ? 'Past' : isFuture ? 'Future' : '';
    const sprintIssues = getIssues().filter(i => i.sprint === s.id);
    const totalSP = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const doneSP = sprintIssues.filter(i => i.status === 'done').reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    return `<div class="sprint-list-item ${statusClass}">
      <div class="sprint-list-info">
        <strong>${escapeHtml(s.name)}</strong>
        <span class="sprint-list-dates">${formatDate(s.startDate)} → ${formatDate(s.endDate)}</span>
        <span class="sprint-list-status">${statusLabel}</span>
        <span class="sprint-list-points">${doneSP}/${totalSP} points</span>
      </div>
      <div class="sprint-list-actions">
        ${!s.archived ? `<button class="btn btn-secondary btn-sm sprint-activate-btn" data-id="${s.id}">${active ? 'Active' : 'Activate'}</button>` : ''}
        <button class="btn btn-danger btn-sm sprint-archive-btn" data-id="${s.id}">${s.archived ? 'Restore' : 'Archive'}</button>
        <button class="btn btn-danger btn-sm sprint-delete-btn" data-id="${s.id}">Delete</button>
      </div>
    </div>`;
  }).join('');

  // Activate buttons
  container.querySelectorAll('.sprint-activate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      // Deactivate all others
      Object.keys(getSprints()).forEach(k => {
        if (getSprints()[k].id !== id) getSprints()[k].active = false;
      });
      getSprints()[id].active = true;
      saveSprints();
      renderSprintList();
      // Update sprint bar
      const newActive = getActiveSprint();
      if (newActive) {
        const sprintBar = document.getElementById('sprint-bar');
        if (sprintBar) {
          sprintBar.style.display = 'block';
          document.getElementById('sprint-bar-name').textContent = newActive.name;
          updateSprintProgressBar(newActive);
        }
      }
      showToast('Sprint activated', 'success');
    });
  });

  // Archive/restore buttons
  container.querySelectorAll('.sprint-archive-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const archived = !getSprints()[id].archived;
      getSprints()[id].archived = archived;
      saveSprints();
      renderSprintList();
      populateSprintFilter();
      populateSprintSelect();
      showToast(archived ? 'Sprint archived' : 'Sprint restored', 'success');
    });
  });

  // Delete buttons
  container.querySelectorAll('.sprint-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!confirm('Delete this sprint? Issues will be unassigned from it.')) return;
      deleteSprint(id);
      renderSprintList();
      populateSprintFilter();
      populateSprintSelect();
      updateSprintBar();
      showToast('Sprint deleted', 'success');
    });
  });
}
