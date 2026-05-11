// ===== Main Initialization (Orchestrator) =====
// P2: Split into focused modules - each module's init() is called below
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Initialize data
  initializeData();

  // Render
  renderSidebar();
  renderBoard();
  initDragDrop();
  populateAssigneeFilter();
  updateSprintBar();
  populateSprintSelect();

  // Show sprint bar if active sprint exists
  const activeSprint = getActiveSprint();
  if (activeSprint) {
    const sprintBar = document.getElementById('sprint-bar');
    if (sprintBar) {
      sprintBar.style.display = 'block';
      document.getElementById('sprint-bar-name').textContent = activeSprint.name;
      updateSprintProgressBar(activeSprint);
    }
  }

  // Update nav project name to match current project
  const navName = document.getElementById('nav-project-name');
  if (navName && getProjects()[getCurrentProject()]) {
    navName.textContent = getProjects()[getCurrentProject()].name;
  }

  // Update board title to show project name
  const boardTitle = document.getElementById('board-title');
  if (boardTitle && getProjects()[getCurrentProject()]) {
    boardTitle.textContent = `${getProjects()[getCurrentProject()].icon} ${getProjects()[getCurrentProject()].name} — Board`;
  }

  // Initialize all module event listeners
  initSidebarToggle();
  initProjects();
  initSaveFilter();
  initColumnConfig();
  initColumnMenuButtons();
  initSprints();
  initBulkActions();
  initExportImport();
  initModals();
  initDetailPanel();
  initFilterControls();
  initShortcuts();
  initNotifications();
  initOnboarding();
  initTheme();

  // Initialize calendar
  initCalendar();

  // Render trash
  renderTrash();
});
