// ===== Modal & Overlay Helpers Module =====
// Handles: issue modal open/close, sidebar toggle, column menus, detail panel

// ===== Modal helpers =====
function openModal() {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('issue-title').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('issue-form').reset();
}

function initModals() {
  // Add card buttons
  document.querySelectorAll('.btn-add-card').forEach(btn => {
    btn.addEventListener('click', () => openModal());
  });

  // Column "..." menu buttons
  document.querySelectorAll('.column-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const column = btn.closest('.column');
      const colId = column.dataset.colId;
      const colDef = getEffectiveColumns().find(c => c.id === colId);
      const status = colDef?.status || column.dataset.status;
      const labels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
      const isCustom = !colDef?.status;
      const menu = document.createElement('div');
      menu.className = 'column-menu';
      menu.style.cssText = `position:absolute;top:36px;right:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.12);z-index:60;min-width:180px;padding:4px 0;`;
      menu.innerHTML = `
        <button class="column-menu-item" data-action="rename" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;">
          ${lucideIcon('Pencil', { class: 'icon-sm' })} Rename column
        </button>
        <button class="column-menu-item" data-action="add-card" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;">
          ${lucideIcon('Plus', { class: 'icon-sm' })} Add card
        </button>
        ${isCustom ? '' : `<button class="column-menu-item" data-action="clear-status" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--danger);cursor:pointer;">
          ${lucideIcon('Trash', { class: 'icon-sm' })} Clear all cards
        </button>`}
        ${isCustom ? '' : `<hr style="border:none;border-top:1px solid var(--border-light);margin:4px 0;">`}
        <button class="column-menu-item" data-action="close" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;font-size:13px;color:var(--text-muted);cursor:pointer;">
          ${lucideIcon('X', { class: 'icon-sm' })} Close
        </button>
      `;
      const header = btn.closest('.column-header');
      header.style.position = 'relative';
      header.appendChild(menu);

      const closeMenu = (ev) => {
        if (!header.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      document.addEventListener('click', closeMenu);

      menu.querySelectorAll('.column-menu-item').forEach(item => {
        item.addEventListener('click', () => {
          const action = item.dataset.action;
          if (action === 'close' || action === 'rename' || action === 'add-card' || action === 'clear-status') {
            menu.remove();
          }
          if (action === 'rename') {
            const newName = prompt('Rename column:', colDef?.name || status);
            if (newName && newName.trim()) {
              const titleSpan = column.querySelector('.column-title span:nth-child(2)');
              titleSpan.textContent = newName.trim();
              if (colDef) {
                updateCustomColumn(colId, { name: newName.trim() });
              }
              addActivity('Pencil', `Renamed column to <strong>${escapeHtml(newName.trim())}</strong>`);
            }
          }
          if (action === 'add-card') {
            openModal();
          }
          if (action === 'clear-status' && status) {
            const count = getIssues().filter(i => i.status === status).length;
            if (count === 0) return;
            if (confirm(`Delete all ${count} cards in this column?`)) {
              const clearedIssues = getIssues().filter(i => i.status === status);
              setIssues(getIssues().filter(i => i.status !== status));
              saveState();
              renderBoard();
              updateCounts();
              addActivity('Trash', `Cleared ${count} cards from <strong>${labels[status]}</strong>`);
              showUndoToast(`${count} cards cleared`, () => {
                clearedIssues.forEach(i => getIssues().push(i));
                saveState();
                renderBoard();
                updateCounts();
                removeUndoToast();
                showToast('Cards restored', 'success');
              });
            }
          }
        });
      });
    });
  });

  // Detail panel close
  const detailClose = document.getElementById('detail-close');
  if (detailClose) {
    detailClose.addEventListener('click', closeDetailPanel);
  }
  const detailBackdrop = document.getElementById('detail-backdrop');
  if (detailBackdrop) {
    detailBackdrop.addEventListener('click', closeDetailPanel);
  }
}
