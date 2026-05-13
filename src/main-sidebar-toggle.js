// ===== Sidebar Toggle Module =====
function initSidebarToggle() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const wrapper = document.getElementById('sidebar-wrapper');
    const toggle = document.getElementById('sidebar-toggle');
    const isCollapsed = wrapper.classList.toggle('collapsed');
    // Move toggle button position: at sidebar edge when open, at screen left when collapsed
    if (isCollapsed) {
      toggle.style.left = '0';
    } else {
      toggle.style.left = '260px';
    }
  });
}

