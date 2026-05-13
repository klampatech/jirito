// ===== Modal Helpers Module =====
// Handles: modal open/close only
// Note: issue form submission is handled by main-issue-form.js

function openModal(status) {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('issue-status').value = status || 'todo';
  document.getElementById('issue-title').focus();
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('issue-form').reset();
}

function initModals() {
  document.getElementById('add-issue-btn').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (!e.target.closest('.modal')) closeModal();
  });

  // Add card buttons (delegate to column footer)
  document.querySelectorAll('.btn-add-card').forEach(btn => {
    btn.addEventListener('click', () => openModal());
  });
}

