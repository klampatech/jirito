// ===== Keyboard Shortcuts Module =====
// Handles: global keydown events, keyboard navigation

function initShortcuts() {
  document.addEventListener('keydown', e => {
    // Escape key: close any open overlay/panel
    if (e.key === 'Escape') {
      const panel = document.getElementById('detail-panel');
      if (panel.classList.contains('open')) {
        closeDetailPanel();
        return;
      }
      const modal = document.getElementById('modal-overlay');
      if (modal.style.display === 'flex') {
        closeModal();
        return;
      }
      const projectModal = document.getElementById('project-modal-overlay');
      if (projectModal.style.display === 'flex') {
        projectModal.style.display = 'none';
        return;
      }
      const onboarding = document.getElementById('onboarding-overlay');
      if (onboarding.style.display === 'flex') {
        onboarding.style.display = 'none';
        return;
      }
    }

    // Ctrl/Cmd+K: focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
    }

    // Ctrl/Cmd+N: new issue
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openModal();
    }

    // Ctrl/Cmd+Z: undo (no shift)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (currentUndoCallback) {
        currentUndoCallback();
        removeUndoToast();
      }
    }

    // Arrow key navigation for cards
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.ctrlKey && !e.metaKey) {
      const active = document.activeElement;
      if (active && active.classList.contains('issue-card')) {
        e.preventDefault();
        const column = active.closest('.column-body');
        const cards = [...column.querySelectorAll('.issue-card:not(.dragging)')];
        const idx = cards.indexOf(active);
        let nextIdx;
        if (e.key === 'ArrowDown') {
          nextIdx = Math.min(idx + 1, cards.length - 1);
        } else {
          nextIdx = Math.max(idx - 1, 0);
        }
        if (nextIdx !== idx) {
          cards[nextIdx].focus();
        }
      }
    }
  });
}
