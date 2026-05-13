// ===== Notification Dropdown Module =====
// Handles: notification bell, overdue issues display

function updateNotificationDropdown() {
  const body = document.getElementById('notification-dropdown-body');
  if (!body) return;
  const overdue = getIssues().filter(i => isOverdue(i.dueDate, i.status));
  if (overdue.length === 0) {
    body.innerHTML = '<div class="notification-empty">No overdue issues</div>';
    return;
  }
  body.innerHTML = overdue.map(i => `
    <div class="notification-item" data-id="${i.id}">
      <span class="notification-key">${generateIssueKey(getProjectKey(), i.id)}</span>
      <span class="notification-title">${escapeHtml(i.title)}</span>
      <span class="notification-date">Due: ${formatDate(i.dueDate)}</span>
    </div>
  `).join('');
  body.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', () => {
      openDetailPanel(parseInt(item.dataset.id));
      document.getElementById('notification-dropdown').style.display = 'none';
    });
  });
}

function initNotifications() {
  const bell = document.getElementById('notification-bell');
  const dropdown = document.getElementById('notification-dropdown');
  if (bell) {
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
      } else {
        updateNotificationDropdown();
        dropdown.style.display = 'block';
        // Position dropdown under the bell icon using fixed positioning
        const bellRect = bell.getBoundingClientRect();
        dropdown.style.top = (bellRect.bottom + 4) + 'px';
        dropdown.style.right = (window.innerWidth - bellRect.right) + 'px';
        dropdown.style.left = 'auto';
      }
    });
  }
  document.addEventListener('click', (e) => {
    if (dropdown && !bell.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}
