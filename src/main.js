/**
 * src/main.ts — application bootstrap.
 *
 * Thin orchestrator. All logic lives in focused modules:
 *   main-projects.ts        — project creation, export/import, bulk actions
 *   main-sprints.ts         — sprint management modal & filter
 *   main-shortcuts.ts       — keyboard shortcuts & navigation
 *   main-theme.ts           — theme toggle & persistence
 *   main-modals.ts          — issue modal, column menus
 *   main-notifications.ts   — notification bell & dropdown
 *   main-trash.ts           — trash display & restore
 *   main-onboarding.ts      — first-time user wizard
 *   main-issue-form.ts      — create-issue form submission
 *   main-filters.ts         — search & filter selects
 *   main-filter-controls.ts — sprint filter & debounced search
 *   main-column-config.ts   — column configuration modal
 *   main-column-menu.ts     — per-column dropdown menu
 *   main-detail-panel.ts    — detail panel close button
 *   main-export-import.ts   — JSON export/import buttons
 *   main-bulk-actions.ts    — bulk action bar listeners
 *   main-sidebar.ts         — sidebar placeholder
 *   main-sidebar-toggle.ts  — sidebar collapse/expand
 *   main-save-filter.ts     — save-current-filter button
 *
 * Conversion notes from src/main.js:
 *   - 1:1 translation of the DOMContentLoaded body.
 *   - All cross-module references are real `import` statements; no
 *     `attach()` indirection (plan §10.1).
 *   - `window.__jiritoStateReady` / `window.__jiritoHasPendingSave`
 *     are exposed by `state.ts`; the `beforeunload` flush calls
 *     `saveStateImmediate()` only when there is a pending debounced
 *     save (to avoid clobbering fresher server state from other tabs).
 */
import { getActiveSprint, getCurrentProject, getProjects, initializeData, loadState, saveStateImmediate, } from "./state.js";
import { initCalendar, initIconPicker, populateAssigneeFilter, renderBoard, renderSidebar, switchView } from "./render.js";
import { initSSE } from "./sse-client.js";
import { initDragDrop } from "./events.js";
import { populateSprintSelect, updateSprintBar, updateSprintProgressBar } from "./utils.js";
import { initBulkActions } from "./main-bulk-actions.js";
import { initColumnConfig } from "./main-column-config.js";
import { initColumnMenuButtons } from "./main-column-menu.js";
import { initDetailPanel } from "./main-detail-panel.js";
import { initExportImport } from "./main-export-import.js";
import { initFilterControls } from "./main-filter-controls.js";
import { initFilters } from "./main-filters.js";
import { initIssueForm } from "./main-issue-form.js";
import { initModals } from "./main-modals.js";
import { initNotifications } from "./main-notifications.js";
import { initOnboarding } from "./main-onboarding.js";
import { initProfile } from "./main-profile.js";
import { initProjects } from "./main-projects.js";
import { initSaveFilter } from "./main-save-filter.js";
import { initShortcuts } from "./main-shortcuts.js";
import { initSidebar } from "./main-sidebar.js";
import { initSidebarToggle } from "./main-sidebar-toggle.js";
import { initSprints } from "./main-sprints.js";
import { initTheme } from "./main-theme.js";
import { renderTrash } from "./main-trash.js";
console.log("[main] main.ts loaded");
document.addEventListener("DOMContentLoaded", async () => {
    console.log("[main] DOMContentLoaded, loadState exists:", typeof loadState);
    // 1. Load state (async — detects server availability and loads from storage layer)
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
        const sprintBar = document.getElementById("sprint-bar");
        if (sprintBar) {
            sprintBar.style.display = "block";
            document.getElementById("sprint-bar-name").textContent = activeSprint.name;
            updateSprintProgressBar(activeSprint);
        }
    }
    // Update nav project name to match current project
    const navName = document.getElementById("nav-project-name");
    const projects = getProjects();
    if (navName && projects[getCurrentProject()]) {
        navName.textContent = projects[getCurrentProject()].name;
    }
    // Update board title to show project name
    const boardTitle = document.getElementById("board-title");
    if (boardTitle && projects[getCurrentProject()]) {
        const proj = projects[getCurrentProject()];
        boardTitle.textContent = `${proj.icon ?? ""} ${proj.name} — Board`.trim();
    }
    // Make logo clickable — routes to board view
    const logoHome = document.getElementById("logo-home");
    if (logoHome) {
        logoHome.addEventListener("click", (e) => {
            e.preventDefault();
            switchView("board");
        });
    }
    // 3. Initialize all feature modules
    initProjects();
    initSprints();
    initShortcuts();
    initTheme();
    initModals();
    initIconPicker();
    initNotifications();
    initProfile();
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
    initColumnConfig();
    // 4. SSE — real-time board updates from squad agents and other tabs
    initSSE();
    // 5. Show onboarding on first load
    initOnboarding();
    // 5. Initialize calendar
    initCalendar();
    // 6. Render trash
    renderTrash();
    // 7. Flush pending saves before page unload — but only if the
    //    debounced save is actually queued. Always saving would clobber
    //    fresher server state (e.g., after a direct API mutation in
    //    another tab or in tests) with this tab's in-memory snapshot.
    window.addEventListener("beforeunload", () => {
        if (window.__jiritoHasPendingSave && window.__jiritoHasPendingSave()) {
            void saveStateImmediate();
        }
    });
    // 8. Signal completion for test runners / E2E tooling. Set on window so
    //    it's accessible from page.evaluate() across reloads. This MUST be
    //    after the full UI init — tests wait for this flag to know that
    //    click handlers and other UI machinery are in place.
    try {
        window.__jiritoStateReady = true;
    }
    catch {
        /* ignore */
    }
});
//# sourceMappingURL=main.js.map