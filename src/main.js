// ===== Main Initialization =====
// Thin orchestrator — all logic extracted to focused modules:
//   main-projects.js    — project creation, column config, export/import, bulk actions
//   main-sprints.js     — sprint management modal & filter
//   main-shortcuts.js   — keyboard shortcuts & navigation
//   main-theme.js       — theme toggle & persistence
//   main-modals.js      — issue modal, column menus, detail panel
//   main-notifications.js — notification bell & dropdown
//   main-trash.js       — trash display & restore
//   main-onboarding.js  — first-time user wizard

console.log('[main] main.js loaded');
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[main] DOMContentLoaded, loadState exists:', typeof loadState);
  // Load state (async — detects server availability and loads from storage layer)
  await loadState();
  initializeData();

  // 2. Render core UI
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

  // 3. Initialize all feature modules
  initProjects();
  initSprints();
  initShortcuts();
  initTheme();
  initModals();
  initNotifications();
  initFilters();
  initIssueForm();
  initSidebar();
  initColumnMenuButtons();
  initDetailPanel();
  initSidebarToggle();
  initSaveFilter();
  initExportImport();
  initBulkActions();
  initFilterControls();


  // 4. Show onboarding on first load
initOnboarding();

  // 5. Initialize calendar
  initCalendar();

  // 6. Render trash
  renderTrash();

  // 7. Flush pending saves before page unload — but only if the
  //    debounced save is actually queued. Always saving would clobber
  //    fresher server state (e.g., after a direct API mutation in
  //    another tab or in tests) with this tab's in-memory snapshot.
  window.addEventListener('beforeunload', () => {
    if (window.__jiritoHasPendingSave && window.__jiritoHasPendingSave()) {
      saveStateImmediate();
    }
  });

  // 8. Signal completion for test runners / E2E tooling. Set on window so
  //    it's accessible from page.evaluate() across reloads. This MUST be
  //    after the full UI init — tests wait for this flag to know that
  //    click handlers and other UI machinery are in place.
  try { window.__jiritoStateReady = true; } catch (e) { /* ignore */ }
});
