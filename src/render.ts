/**
 * src/render.ts — DOM rendering for board, list, calendar, dashboard,
 * sidebar, and detail-panel-adjacent views.
 *
 * Conversion notes (from src/render.js):
 *   - All top-level functions get explicit return types (mostly `void`).
 *   - Cross-module function references are now real `import` statements
 *     (the `attach()` indirection was removed in plan §10.1).
 *   - The `typeIcons` lookup is a top-level `const` in `state.js` and
 *     becomes a global `const` in classic-script mode; we declare it
 *     once at the bottom of this file.
 *   - `data-id` attributes are always strings, so comparisons against
 *     numeric `issue.id` go through `String(...)` to avoid surprises
 *     (matches the same coercion pattern in `state.ts`'s `_matchesId`).
 *
 * Behavior is preserved 1:1; only types and exports are added.
 */

import type { Issue, SavedFilter } from "./types";
import { typeIcons } from "./state.js";
import {
  addActivity,
  getActiveSprint,
  getActivityLog,
  getComments,
  getCurrentProject,
  getCurrentView,
  getCustomColumns,
  getDefaultColumns,
  getDependents,
  getDependencies,
  getEffectiveColumns,
  getIssues,
  getProjects,
  getSavedFilters,
  getSelectedIds,
  getSprints,
  saveState,
  setCurrentProject,
  setCurrentView,
  setIssues,
  removeCustomColumn,
  setCustomColumns,
  updateCustomColumn,
  updateDefaultColumn,
} from "./state.js";
import {
  escapeHtml,
  formatDate,
  generateIssueKey,
  getAllLabels,
  getCalendarDays,
  getMonthName,
  getProjectKey,
  isOverdue,
  lucideIcon,
  timeAgo,
  truncateDesc,
  updateSprintProgress,
} from "./utils.js";
import {
  applyFilters,
  filterIssues,
  initDragDrop,
  openDetailPanel,
  removeUndoToast,
  showToast,
  updateBulkBar,
} from "./events.js";
import { deleteProject } from "./data.js";

// ===== Rendering =====

export function renderBoard(): void {
  const board = document.getElementById("board");
  if (!board) return;

  // Empty state — no projects. The app no longer auto-seeds a default
  // project (see references/2026-06-21-no-demo-data.md), so a fresh user
  // lands here with no projects. Show a centered welcome with a CTA to
  // create the first project, instead of an empty board.
  if (Object.keys(getProjects()).length === 0 || !getCurrentProject()) {
    board.innerHTML = `
      <div class="board-empty">
        <i class="ph ph-rocket board-empty-icon"></i>
        <h2 class="board-empty-title">Welcome to Jirito</h2>
        <p class="board-empty-msg">Create your first project to start tracking issues, sprints, and progress.</p>
        <button class="btn btn-primary btn-empty-create-board" id="board-empty-create-btn" type="button">
          <i class="ph ph-plus icon"></i>
          Create your first project
        </button>
      </div>
    `;
    const btn = board.querySelector("#board-empty-create-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        const overlay = document.getElementById("project-modal-overlay") as HTMLElement | null;
        if (overlay) overlay.style.display = "flex";
        const nameInput = document.getElementById("project-name") as HTMLInputElement | null;
        if (nameInput) nameInput.focus();
      });
    }
    return;
  }

  // The empty-state branch above sets `board.innerHTML` to a `.board-empty`
  // welcome div; the rest of this function only manipulates `.column`
  // children additively. When the user creates their first project and we
  // re-enter here, that empty-state div would otherwise remain in the DOM
  // alongside the freshly synced columns. Remove it explicitly so the
  // welcome UI doesn't persist after a project exists.
  board.querySelector(".board-empty")?.remove();

  const columns = getEffectiveColumns();
  const existingCols = board.querySelectorAll(".column");

  // Remove columns that no longer exist
  existingCols.forEach((col) => {
    const colId = (col as HTMLElement).dataset.colId;
    const colDef = columns.find((c) => c.id === colId);
    if (!colDef) {
      col.remove();
      return;
    }
    // Update column header if name changed
    const titleSpan = col.querySelector(".column-title span:nth-child(2)");
    if (titleSpan && titleSpan.textContent !== colDef.name) {
      titleSpan.textContent = colDef.name;
    }
    // Update border color on .column-header (the element that holds the colored top border)
    const header = col.querySelector(".column-header") as HTMLElement | null;
    if (header && colDef.color) {
      header.style.borderTopColor = colDef.color;
    }
  });

  // Create or update columns
  columns.forEach((colDef) => {
    let col = board.querySelector<HTMLElement>(
      `.column[data-col-id="${colDef.id}"]`
    );
    if (!col) {
      col = document.createElement("div");
      col.className = "column";
      col.dataset.status = colDef.status || colDef.id;
      col.dataset.colId = colDef.id;
      col.style.borderTopColor = colDef.color || "#9E9E9E";
      col.innerHTML = `
      <div class="column-header" style="border-top-color: ${colDef.color || "#9E9E9E"}">
          <div class="column-title">
            <span class="status-dot" style="background:${colDef.color}"></span>
            <span>${escapeHtml(colDef.name)}</span>
            <span class="count" data-count-for="${colDef.id}">0</span>
          </div>
          <button class="btn-icon column-menu-btn" data-col-id="${colDef.id}">⋯</button>
        </div>
        <div class="column-body" data-status="${colDef.status || colDef.id}" data-col-id="${colDef.id}" role="list" aria-label="${escapeHtml(colDef.name)} column"></div>
        <div class="column-footer">
          <button class="btn-add-card" data-status="${colDef.status || colDef.id}">+ Add card</button>
        </div>
      `;
      board.appendChild(col);
      // Re-init drag drop for new column
      initDragDrop();
    }

    // Render cards in column
    const colBody = col.querySelector(".column-body");
    if (!colBody) return;
    colBody.innerHTML = "";
    const allIssues = getIssues();
    const currentProject = getCurrentProject();
    let colIssues = allIssues.filter((i) => {
      if (colDef.status) return i.status === colDef.status;
      // For custom columns without status mapping, filter by customColumnId
      return i.customColumnId === colDef.id;
    });
    // Filter by current project. Issues without a projectId (e.g., legacy
    // localStorage data, or pre-migration fixtures) fall back to the
    // current project so they continue to show up.
    colIssues = colIssues.filter(
      (i) => (i.projectId || currentProject) === currentProject
    );
    // Apply sprint filter
    const sprintFilter =
      (document.getElementById("sprint-filter") as HTMLSelectElement | null)?.value || "all";
    if (sprintFilter !== "all") {
      colIssues = colIssues.filter((i) => i.sprint === sprintFilter);
    }
    // Sort by rank (custom ordering)
    colIssues.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    colIssues.forEach((issue) => {
      colBody.appendChild(createCard(issue));
    });

    // Update count
    const countEl = col.querySelector(`[data-count-for="${colDef.id}"]`);
    if (countEl) countEl.textContent = String(colIssues.length);
  });

  updateCounts();
  updateSprintProgress();
  // Re-init drag drop so column-body listeners work on freshly rendered cards
  initDragDrop();
}

export function createCard(issue: Issue): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "issue-card";
  card.draggable = true;
  card.dataset.id = String(issue.id);
  card.dataset.type = issue.type;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute(
    "aria-label",
    `${generateIssueKey(getProjectKey(), issue.id)}: ${escapeHtml(issue.title)}`
  );

  const commentCount = (getComments()[issue.id] || []).length;
  const projectKey = getProjectKey();
  const key = generateIssueKey(projectKey, issue.id);
  const deps = getDependencies(issue.id);
  const dependents = getDependents(issue.id);

  let labelsHtml = "";
  if (issue.labels && issue.labels.length > 0) {
    labelsHtml = `<div class="issue-labels">${issue.labels
      .map((l) => `<span class="issue-label">${escapeHtml(l)}</span>`)
      .join("")}</div>`;
  }

  // Sprint badge
  let sprintBadge = "";
  if (issue.sprint) {
    const sprints = getSprints();
    const sprint = sprints[issue.sprint];
    if (sprint) {
      sprintBadge = `<span class="issue-sprint-badge" title="${escapeHtml(sprint.name)}">${lucideIcon("Lightning", { class: "icon-sm" })} ${escapeHtml(sprint.name)}</span>`;
    }
  }

  // Dependency indicators
  let depIndicators = "";
  if (dependents.length > 0) {
    depIndicators = `<span class="issue-dep-badge" title="${dependents.length} issue(s) depend on this">${lucideIcon("Link", { class: "icon-sm" })} ${dependents.length}</span>`;
  }
  if (deps.length > 0) {
    depIndicators += `<span class="issue-dep-badge" title="${deps.length} dependency">${lucideIcon("Link", { class: "icon-sm" })} ${deps.length}</span>`;
  }

  card.innerHTML = `
    <div class="issue-card-header">
      <input type="checkbox" class="issue-checkbox" data-id="${issue.id}" onclick="event.stopPropagation()" aria-label="Select issue ${key}">
      <span class="issue-key">${key}</span>
      <span class="issue-type-icon">${lucideIcon(typeIcons[issue.type] || "File", { class: "icon" })}</span>
      ${depIndicators ? `<span class="issue-dep-indicators">${depIndicators}</span>` : ""}
    </div>
    ${labelsHtml}
    ${sprintBadge ? `<div class="issue-sprint-row">${sprintBadge}</div>` : ""}
    <div class="issue-title">${escapeHtml(issue.title)}</div>
    ${issue.desc ? `<div class="issue-desc">${truncateDesc(issue.desc, 120)}</div>` : ""}
    <div class="issue-card-footer">
      <span class="issue-priority priority-${escapeHtml(issue.priority)}">${escapeHtml(issue.priority)}</span>
      ${issue.storyPoints ? `<span class="issue-sp-badge" title="Story Points">${lucideIcon("Target", { class: "icon-sm" })} ${issue.storyPoints}</span>` : ""}
      ${issue.dueDate ? `<span class="issue-due-date ${isOverdue(issue.dueDate, issue.status) ? "overdue" : ""}">${lucideIcon("Calendar", { class: "icon-sm" })} ${formatDate(issue.dueDate)}</span>` : ""}
      <div style="display:flex;align-items:center;gap:8px;">
        ${commentCount > 0 ? `<span class="issue-comments-badge">${lucideIcon("Chat", { class: "icon-sm" })} ${commentCount}</span>` : ""}
        ${issue.assignee ? `<div class="issue-assignee" title="${escapeHtml(issue.assignee)}">${issue.assignee.charAt(0).toUpperCase()}</div>` : ""}
      </div>
    </div>
  `;

  // Click to open detail panel (delegated via column-body)
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute(
    "aria-label",
    `${generateIssueKey(getProjectKey(), issue.id)}: ${escapeHtml(issue.title)}`
  );

  // Keyboard support
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetailPanel(issue.id);
    }
  });

  // Checkbox for bulk actions
  const checkbox = card.querySelector<HTMLInputElement>(".issue-checkbox");
  if (checkbox) {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) getSelectedIds().add(issue.id);
      else getSelectedIds().delete(issue.id);
      updateBulkBar();
    });
  }

  return card;
}

export function updateCounts(): void {
  const columns = getEffectiveColumns();
  columns.forEach((colDef) => {
    const countEl = document.querySelector(`[data-count-for="${colDef.id}"]`);
    if (countEl) {
      const status = colDef.status;
      if (status) {
        countEl.textContent = String(
          getIssues().filter((i) => i.status === status).length
        );
      } else {
        // Custom column: count issues with matching customColumnId
        countEl.textContent = String(
          getIssues().filter((i) => i.customColumnId === colDef.id).length
        );
      }
    }
  });
  updateNotifications();
}

// ===== Notifications =====
export function updateNotifications(): void {
  const bell = document.getElementById("notification-bell");
  const countEl = document.getElementById("notification-count");
  if (!bell || !countEl) return;
  const overdue = getIssues().filter((i) => isOverdue(i.dueDate, i.status));
  if (overdue.length > 0) {
    countEl.textContent = String(overdue.length);
    (countEl as HTMLElement).style.display = "flex";
    bell.title = `${overdue.length} overdue issue${overdue.length > 1 ? "s" : ""}: ${overdue.map((i) => escapeHtml(i.title)).join(", ")}`;
  } else {
    (countEl as HTMLElement).style.display = "none";
    bell.title = "No notifications";
  }
}

// ===== Sidebar Rendering =====
export function renderSidebar(): void {
  renderProjects();
  renderViews();
  renderSavedFilters();
  renderActivity();
}

// ===== Inline Project Rename =====
export function startInlineRename(key: string, itemEl: HTMLElement): void {
  const proj = getProjects()[key];
  if (!proj) return;

  const nameSpan = itemEl.querySelector(".project-name");
  if (!nameSpan) return;
  const currentName = proj.name;

  // Replace the name span with an input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-rename-input";
  input.value = currentName;
  input.maxLength = 50;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finishRename = (): void => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      proj.name = newName;
      saveState();
      addActivity("Pencil", `Renamed project to <strong>${escapeHtml(newName)}</strong>`);
      showToast("Project renamed", "success");
    }
    // Re-render to restore the name span
    renderProjects();
    // Update nav project name if this is the current project
    if (getCurrentProject() === key) {
      const navName = document.getElementById("nav-project-name");
      if (navName) navName.textContent = getProjects()[key].name;
    }
  };

  input.addEventListener("blur", finishRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      input.blur();
    } else if (e.key === "Escape") {
      input.value = currentName;
      input.blur();
    }
  });
}

export function renderProjects(): void {
  const list = document.getElementById("project-list");
  if (!list) return;
  list.innerHTML = "";
  const projects = getProjects();
  const projectKeys = Object.keys(projects);
  if (projectKeys.length === 0) {
    // Empty state — no projects yet. The app no longer auto-seeds a default
    // project (see references/2026-06-21-no-demo-data.md), so the user
    // creates their first project through this CTA.
    const empty = document.createElement("div");
    empty.className = "project-empty";
    empty.innerHTML = `
      <i class="ph ph-folder-open project-empty-icon"></i>
      <p class="project-empty-msg">No projects yet</p>
      <button class="btn-empty-create" id="empty-create-project-btn" type="button">
        <i class="ph ph-plus icon-sm"></i>
        Create your first project
      </button>
    `;
    const btn = empty.querySelector("#empty-create-project-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        const overlay = document.getElementById("project-modal-overlay") as HTMLElement | null;
        if (overlay) overlay.style.display = "flex";
        const nameInput = document.getElementById("project-name") as HTMLInputElement | null;
        if (nameInput) nameInput.focus();
      });
    }
    list.appendChild(empty);
    return;
  }
  Object.entries(projects).forEach(([key, proj]) => {
    const item = document.createElement("div");
    item.className = `project-item${key === getCurrentProject() ? " active" : ""}`;
    item.dataset.key = key;
    item.innerHTML = `
      <span class="project-icon">${proj.icon}</span>
      <span class="project-key">${proj.key ? proj.key.toUpperCase() : key.toUpperCase()}</span>
      <span class="project-name" title="Click to rename">${escapeHtml(proj.name)}</span>
      <button class="project-delete" data-key="${key}" title="Delete project">✕</button>
    `;
    item.addEventListener("click", (e) => {
      // Don't switch project when clicking the delete button
      if ((e.target as HTMLElement).closest(".project-delete")) return;
      // If clicking the project name and the project is already selected, trigger inline rename
      const nameTarget = (e.target as HTMLElement).closest(".project-name");
      if (nameTarget && key === getCurrentProject()) {
        e.stopPropagation();
        startInlineRename(key, item);
        return;
      }
      switchProject(key);
    });
    const deleteBtn = item.querySelector(".project-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteProject(key);
      });
    }
    list.appendChild(item);
  });
}

export function renderViews(): void {
  const list = document.getElementById("view-list");
  if (!list) return;
  list.innerHTML = "";
  const views: Array<{ id: "board" | "list" | "calendar" | "dashboard"; icon: string; label: string }> = [
    { id: "board", icon: "Layout", label: "Board" },
    { id: "list", icon: "List", label: "List" },
    { id: "calendar", icon: "Calendar", label: "Calendar" },
    { id: "dashboard", icon: "ChartBar", label: "Dashboard" },
  ];
  views.forEach((v) => {
    const item = document.createElement("div");
    item.className = `view-item${v.id === getCurrentView() ? " active" : ""}`;
    item.innerHTML = `<span class="view-icon">${lucideIcon(v.icon, { class: "icon" })}</span><span>${v.label}</span>`;
    item.addEventListener("click", () => switchView(v.id));
    list.appendChild(item);
  });
  // Re-render Phosphor icons in the view list
}

// ===== Column Configuration =====
const DEFAULT_COLUMN_IDS = new Set(["todo", "inprogress", "review", "done"]);

export function renderColumnConfig(): void {
  const container = document.getElementById("column-config-list");
  if (!container) return;

  // Show ALL columns: defaults first (with name/color controls), then customs.
  const defaults = getDefaultColumns();
  const customs = getCustomColumns();

  container.innerHTML = [...defaults, ...customs]
    .map((col) => {
      const isDefault = DEFAULT_COLUMN_IDS.has(col.id);
      const statusOptions = ["todo", "inprogress", "review", "done"]
        .map((s) => {
          const labels: Record<string, string> = {
            todo: "To Do",
            inprogress: "In Progress",
            review: "In Review",
            done: "Done",
          };
          return `<option value="${s}" ${col.status === s ? "selected" : ""}>${labels[s]}</option>`;
        })
        .join("");

      // Default columns: name + color only (status is fixed, no delete).
      // Custom columns: name + color + status dropdown + delete.
      const statusSelect = isDefault
        ? `<span style="font-size:12px;color:var(--text-muted);padding:0 4px;">${col.status}</span>`
        : `<select class="column-config-status" data-col-id="${col.id}" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--bg-card);color:var(--text);">
            <option value="">(custom)</option>
            ${statusOptions}
           </select>`;
      const deleteBtn = isDefault
        ? ""
        : `<button class="btn btn-danger btn-sm column-config-delete" data-col-id="${col.id}" style="padding:4px 8px;" title="Delete column">✕</button>`;

      return `<div class="column-config-item${isDefault ? " column-config-default" : ""}" data-col-id="${col.id}" draggable="true" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border:1px solid var(--border);border-radius:6px;background:var(--bg-page);cursor:grab;">
      <span class="column-drag-handle" style="color:var(--text-muted);cursor:grab;">⋮⋮</span>
      <input type="color" value="${col.color}" class="column-config-color" data-col-id="${col.id}" style="width:32px;height:28px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:1px;">
      <input type="text" value="${escapeHtml(col.name)}" class="column-config-name" data-col-id="${col.id}" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;background:var(--bg-card);color:var(--text);">
      ${statusSelect}
      ${deleteBtn}
    </div>`;
    })
    .join("");

  // Color change handlers — works for both defaults and customs
  container.querySelectorAll<HTMLInputElement>(".column-config-color").forEach((input) => {
    input.addEventListener("change", () => {
      const colId = input.dataset.colId;
      if (!colId) return;
      if (DEFAULT_COLUMN_IDS.has(colId)) {
        updateDefaultColumn(colId, { color: input.value });
      } else {
        updateCustomColumn(colId, { color: input.value });
      }
      renderBoard();
    });
  });

  // Name change handlers — works for both defaults and customs
  container.querySelectorAll<HTMLInputElement>(".column-config-name").forEach((input) => {
    input.addEventListener("blur", () => {
      const name = input.value.trim();
      const colId = input.dataset.colId;
      if (!name || !colId) return;
      if (DEFAULT_COLUMN_IDS.has(colId)) {
        updateDefaultColumn(colId, { name });
      } else {
        updateCustomColumn(colId, { name });
      }
      renderBoard();
    });
  });

  // Status change handlers — custom columns only
  container.querySelectorAll<HTMLSelectElement>(".column-config-status").forEach((select) => {
    select.addEventListener("change", () => {
      const colId = select.dataset.colId;
      if (colId) {
        updateCustomColumn(colId, { status: select.value || null });
        renderBoard();
      }
    });
  });

  // Delete handlers — custom columns only
  container.querySelectorAll<HTMLButtonElement>(".column-config-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Delete this column? Cards in it will be moved to To Do.")) {
        const colId = btn.dataset.colId;
        if (!colId) return;
        const col = customs.find((c) => c.id === colId);
        if (col && col.status) {
          getIssues()
            .filter((i) => i.status === col.status)
            .forEach((i) => {
              i.status = "todo";
            });
        } else if (col) {
          getIssues()
            .filter((i) => i.customColumnId === col.id)
            .forEach((i) => {
              i.customColumnId = null;
              i.status = "todo";
            });
        }
        removeCustomColumn(colId);
        renderColumnConfig();
        renderBoard();
        showToast("Column deleted", "success");
      }
    });
  });

  // Drag to reorder — customs only; defaults stay in fixed positions
  let dragIdx: string | null = null;
  container.querySelectorAll<HTMLElement>(".column-config-item").forEach((item) => {
    const colId = item.dataset.colId;
    if (colId && DEFAULT_COLUMN_IDS.has(colId)) return; // skip defaults
    item.addEventListener("dragstart", (e) => {
      dragIdx = item.dataset.colId ?? null;
      item.style.opacity = "0.5";
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
      item.style.opacity = "1";
      dragIdx = null;
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetId = item.dataset.colId;
      if (!dragIdx || !targetId || dragIdx === targetId) return;
      if (DEFAULT_COLUMN_IDS.has(dragIdx) || DEFAULT_COLUMN_IDS.has(targetId)) return;
      const customsArr = getCustomColumns();
      const fromIdx = customsArr.findIndex((c) => c.id === dragIdx);
      const toIdx = customsArr.findIndex((c) => c.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = customsArr.splice(fromIdx, 1);
      customsArr.splice(toIdx, 0, moved);
      // Re-number order fields
      customsArr.forEach((c, i) => {
        c.order = i;
      });
      setCustomColumns(customsArr);
      renderColumnConfig();
      renderBoard();
      saveState();
    });
  });
}

// ===== Calendar View =====
let calendarYear: number = 0;
let calendarMonth: number = 0;

export function initCalendar(): void {
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth();

  document.getElementById("calendar-prev")?.addEventListener("click", () => {
    calendarMonth--;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear--;
    }
    renderCalendarView();
  });
  document.getElementById("calendar-next")?.addEventListener("click", () => {
    calendarMonth++;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear++;
    }
    renderCalendarView();
  });
}

export function renderCalendarView(): void {
  const container = document.getElementById("calendar-container");
  if (!container) return;

  // Navigation HTML
  const navHtml =
    '<div class="calendar-nav"><button class="btn btn-sm btn-calendar-prev" id="calendar-prev">◀</button><span class="calendar-month-label">' +
    getMonthName(calendarMonth) +
    " " +
    calendarYear +
    '</span><button class="btn btn-sm btn-calendar-next" id="calendar-next">▶</button></div>';

  // Shared grid HTML (P3: deduplicated)
  const gridHtml = renderCalendarGrid(calendarYear, calendarMonth);

  container.innerHTML = navHtml + gridHtml;

  // Re-bind navigation
  container.querySelector("#calendar-prev")?.addEventListener("click", () => {
    calendarMonth--;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear--;
    }
    renderCalendarView();
  });
  container.querySelector("#calendar-next")?.addEventListener("click", () => {
    calendarMonth++;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear++;
    }
    renderCalendarView();
  });

  // Click on day to show issues
  container.querySelectorAll<HTMLElement>(".calendar-day.current-month").forEach((day) => {
    day.addEventListener("click", () => {
      const date = day.dataset.date;
      if (!date) return;
      const filtered = filterIssues(getIssues()).filter((i) => i.dueDate === date);
      if (filtered.length > 0) {
        const lines = filtered
          .map((i) => {
            const key = generateIssueKey(getProjectKey(), i.id);
            const statusColors: Record<string, string> = {
              todo: "#9E9E9E",
              inprogress: "#D14A2A",
              review: "#D49B00",
              done: "#34A853",
            };
            const statusColor = statusColors[i.status] || "#9E9E9E";
            return (
              '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border-light);"><span style="width:8px;height:8px;border-radius:50%;background:' +
              statusColor +
              ';flex-shrink:0;"></span><span style="font-size:11px;color:var(--text-muted);min-width:60px;">' +
              key +
              '</span><span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              escapeHtml(i.title) +
              '</span><span style="font-size:10px;color:var(--text-muted);text-transform:capitalize;">' +
              i.status +
              "</span></div>"
            );
          })
          .join("");
        removeUndoToast();
        const toast = document.createElement("div");
        toast.className = "toast toast-undo";
        toast.style.cssText =
          "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:16px 20px;border-radius:8px;font-size:13px;background:var(--bg-card);color:var(--text);box-shadow:0 4px 12px var(--shadow);z-index:200;max-width:400px;max-height:400px;overflow-y:auto;";
        toast.innerHTML =
          '<strong style="display:block;margin-bottom:8px;">📅 ' +
          formatDate(date) +
          "</strong>" +
          lines +
          '<button class="btn btn-sm" style="margin-top:8px;background:var(--primary);color:#fff;border:none;cursor:pointer;" onclick="this.parentElement.remove();">Close</button>';
        document.body.appendChild(toast);
        // Self-contained auto-dismiss: removes THIS specific toast after
        // 15s. We don't try to coordinate with the events.ts `undoToast`
        // module-private state — the date-picker toast is unrelated to
        // the undo-toast system, and a new toast (from showUndoToast or
        // another date pick) will simply remove itself first.
        setTimeout(() => {
          if (toast.parentElement) toast.remove();
        }, 15000);
      }
    });
    day.style.cursor = "pointer";
  });
}

// ===== Calendar Grid Rendering (shared) =====
// P3: Deduplicated — extracted shared grid logic from renderCalendarView
export function renderCalendarGrid(year: number, month: number): string {
  const days = getCalendarDays(year, month);

  let html =
    '<div class="calendar-grid"><div class="calendar-header"><div class="calendar-day-name">Sun</div><div class="calendar-day-name">Mon</div><div class="calendar-day-name">Tue</div><div class="calendar-day-name">Wed</div><div class="calendar-day-name">Thu</div><div class="calendar-day-name">Fri</div><div class="calendar-day-name">Sat</div></div><div class="calendar-body">';

  days.forEach((day) => {
    const isToday =
      day.isCurrentMonth && day.date.toDateString() === new Date().toDateString();
    const cls = day.isCurrentMonth
      ? "calendar-day current-month"
      : "calendar-day other-month";
    const overdue = day.dueIssues.filter((i) => isOverdue(i.dueDate, i.status));
    const hasOverdue = overdue.length > 0;
    const hasDue = day.dueIssues.length > 0;

    html +=
      '<div class="' +
      cls +
      (isToday ? " today" : "") +
      (hasOverdue ? " overdue" : "") +
      '" data-date="' +
      (day.dateStr || "") +
      '">';
    html += '<span class="calendar-day-num">' + day.date.getDate() + "</span>";
    if (hasDue) {
      day.dueIssues.slice(0, 3).forEach((i) => {
        const colors: Record<string, string> = {
          todo: "#9E9E9E",
          inprogress: "#D14A2A",
          review: "#D49B00",
        };
        const color = colors[i.status] || "#9E9E9E";
        html +=
          '<div class="calendar-issue-dot" style="background:' +
          color +
          '" title="' +
          escapeHtml(i.title) +
          '"></div>';
      });
      if (day.dueIssues.length > 3) {
        html += '<span class="calendar-more">+' + (day.dueIssues.length - 3) + "</span>";
      }
    }
    html += "</div>";
  });

  html += "</div></div>";
  return html;
}

// ===== Dashboard View =====
export function renderDashboardView(): void {
  const container = document.getElementById("dashboard-container");
  if (!container) return;

  // Apply active header-bar filters so dashboard stats reflect the user's scope
  const filtered = filterIssues(getIssues());

  const total = filtered.length;
  const byStatus: Record<string, number> = { todo: 0, inprogress: 0, review: 0, done: 0 };
  filtered.forEach((i) => {
    if (byStatus[i.status] !== undefined) byStatus[i.status]++;
  });
  const doneCount = byStatus.done ?? 0;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const overdueCount = filtered.filter((i) => isOverdue(i.dueDate, i.status)).length;
  const highPriority = filtered.filter(
    (i) => i.priority === "high" && i.status !== "done"
  ).length;
  const unassigned = filtered.filter((i) => !i.assignee).length;
  const dueThisWeek = filtered.filter((i) => {
    if (!i.dueDate || i.status === "done") return false;
    const due = new Date(i.dueDate);
    const now = new Date();
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  // Assignee stats
  const byAssignee: Record<string, { total: number; done: number; overdue: number }> = {};
  filtered.forEach((i) => {
    const a = i.assignee || "Unassigned";
    if (!byAssignee[a]) byAssignee[a] = { total: 0, done: 0, overdue: 0 };
    byAssignee[a].total++;
    if (i.status === "done") byAssignee[a].done++;
    if (isOverdue(i.dueDate, i.status)) byAssignee[a].overdue++;
  });
  const assignees = Object.entries(byAssignee).sort(
    (a, b) => b[1].total - a[1].total
  );
  const maxAssigneeTotal = assignees.length > 0 ? assignees[0][1].total : 1;

  // Priority breakdown
  const byPriority: Record<string, number> = { high: 0, medium: 0, low: 0 };
  filtered.forEach((i) => {
    if (byPriority[i.priority] !== undefined) byPriority[i.priority]++;
  });

  // Type breakdown
  const byType: Record<string, number> = { story: 0, bug: 0, task: 0, epic: 0 };
  filtered.forEach((i) => {
    if (byType[i.type] !== undefined) byType[i.type]++;
  });

  // Sprint progress — also scoped to filtered issues
  const activeSprint = getActiveSprint();
  let sprintProgressHtml = "";
  if (activeSprint) {
    const sprintIssues = filtered.filter((i) => i.sprint === activeSprint.id);
    const sprintTotalSP = sprintIssues.reduce(
      (sum, i) => sum + (i.storyPoints || 0),
      0
    );
    const sprintDoneSP = sprintIssues
      .filter((i) => i.status === "done")
      .reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const now = new Date();
    const start = new Date(activeSprint.startDate ?? "");
    const end = new Date(activeSprint.endDate ?? "");
    const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const elapsedDays = Math.max(
      0,
      (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysPct =
      totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;
    const spPct = sprintTotalSP > 0 ? Math.round((sprintDoneSP / sprintTotalSP) * 100) : 0;
    sprintProgressHtml =
      '<div class="dashboard-chart"><h4 class="dashboard-chart-title">Current Sprint: ' +
      escapeHtml(activeSprint.name) +
      '</h4><div style="text-align:center;margin:12px 0;"><div style="font-size:32px;font-weight:700;color:var(--primary);">' +
      spPct +
      '%</div><div style="font-size:11px;color:var(--text-muted);">' +
      sprintDoneSP +
      "/" +
      sprintTotalSP +
      ' story points</div></div><div style="margin:8px 0;"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;"><span>Time: ' +
      daysPct +
      '%</span><span>Points: ' +
      spPct +
      '%</span></div><div style="display:flex;gap:4px;height:8px;border-radius:4px;overflow:hidden;background:var(--bg-page);"><div style="flex:' +
      daysPct +
      ';background:var(--info);border-radius:4px 0 0 4px;"></div><div style="flex:' +
      (100 - daysPct) +
      ';background:var(--border-light);"></div></div><div style="display:flex;gap:4px;height:8px;border-radius:4px;overflow:hidden;background:var(--bg-page);margin-top:4px;"><div style="flex:' +
      spPct +
      ';background:var(--success);border-radius:4px 0 0 4px;"></div><div style="flex:' +
      (100 - spPct) +
      ';background:var(--border-light);"></div></div></div></div>';
  }

  // Pie chart (CSS-only)
  const statusColors: Record<string, string> = {
    todo: "#9E9E9E",
    inprogress: "#D14A2A",
    review: "#D49B00",
    done: "#34A853",
  };
  const statusLabels: Record<string, string> = {
    todo: "To Do",
    inprogress: "In Progress",
    review: "In Review",
    done: "Done",
  };
  let pieConic = "";
  let cumulative = 0;
  Object.entries(byStatus).forEach(([status, count]) => {
    if (count === 0) return;
    const pct = (count / total) * 100;
    pieConic += statusColors[status] + " " + cumulative + "% " + (cumulative + pct) + "%, ";
    cumulative += pct;
  });
  pieConic = pieConic.slice(0, -2);

  // Bar chart for assignees
  const barColors = [
    "#E53935",
    "#D14A2A",
    "#D49B00",
    "#34A853",
    "#2BB5A8",
    "#58A6FF",
    "#9E9E9E",
    "#F5C842",
  ];

  container.innerHTML =
    '<div class="dashboard-stats"><div class="dashboard-stat-card"><div class="dashboard-stat-value">' +
    total +
    '</div><div class="dashboard-stat-label">Total Issues</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--success)">' +
    completionRate +
    '%</div><div class="dashboard-stat-label">Completion Rate</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--danger)">' +
    overdueCount +
    '</div><div class="dashboard-stat-label">Overdue</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--warning)">' +
    highPriority +
    '</div><div class="dashboard-stat-label">High Priority</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--info)">' +
    dueThisWeek +
    '</div><div class="dashboard-stat-label">Due This Week</div></div><div class="dashboard-stat-card"><div class="dashboard-stat-value" style="color:var(--text-muted)">' +
    unassigned +
    '</div><div class="dashboard-stat-label">Unassigned</div></div></div><div class="dashboard-charts"><div class="dashboard-chart"><h4 class="dashboard-chart-title">Issues by Status</h4><div class="dashboard-pie" style="background:conic-gradient(' +
    pieConic +
    ');"></div><div class="dashboard-legend">' +
    Object.entries(byStatus)
      .filter(([, v]) => v > 0)
      .map(
        ([status, count]) =>
          '<div class="dashboard-legend-item"><span class="dashboard-legend-dot" style="background:' +
          statusColors[status] +
          '"></span><span>' +
          statusLabels[status] +
          '</span><span class="dashboard-legend-count">' +
          count +
          "</span></div>"
      )
      .join("") +
    '</div></div><div class="dashboard-chart"><h4 class="dashboard-chart-title">Issues by Assignee</h4><div class="dashboard-bar-chart">' +
    assignees
      .map(
        ([name, data], idx) =>
          '<div class="dashboard-bar-row"><span class="dashboard-bar-label">' +
          escapeHtml(name) +
          '</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:' +
          (data.total / maxAssigneeTotal) * 100 +
          '%;background:' +
          barColors[idx % barColors.length] +
          '"></div></div><span class="dashboard-bar-value">' +
          data.total +
          "</span></div>"
      )
      .join("") +
    '</div></div><div class="dashboard-chart"><h4 class="dashboard-chart-title">By Type</h4><div class="dashboard-priority-bars">' +
    Object.entries(byType)
      .map(([type, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        const color = { story: "#2BB5A8", bug: "#E53935", task: "#34A853", epic: "#F5C842" }[
          type
        ];
        return (
          '<div class="dashboard-bar-row"><span class="dashboard-bar-label">' +
          type.charAt(0).toUpperCase() +
          type.slice(1) +
          '</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:' +
          pct +
          "%;background:" +
          color +
          '"></div></div><span class="dashboard-bar-value">' +
          count +
          "</span></div>"
        );
      })
      .join("") +
    "</div></div>" +
    sprintProgressHtml +
    '<div class="dashboard-chart"><h4 class="dashboard-chart-title">By Priority</h4><div class="dashboard-priority-bars">' +
    Object.entries(byPriority)
      .map(([priority, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        const color = { high: "#E53935", medium: "#F5C842", low: "#34A853" }[priority];
        return (
          '<div class="dashboard-bar-row"><span class="dashboard-bar-label">' +
          priority.charAt(0).toUpperCase() +
          priority.slice(1) +
          '</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:' +
          pct +
          "%;background:" +
          color +
          '"></div></div><span class="dashboard-bar-value">' +
          count +
          "</span></div>"
        );
      })
      .join("") +
    "</div></div>";
}

export function renderSavedFilters(): void {
  const list = document.getElementById("saved-filters");
  if (!list) return;
  list.innerHTML = "";
  getSavedFilters().forEach((f, idx) => {
    const item = document.createElement("div");
    item.className = "saved-filter-item";
    item.innerHTML = `
      <span class="filter-name">${escapeHtml(f.name)}</span>
      <button class="filter-delete" data-idx="${idx}" title="Delete filter">✕</button>
    `;
    item.querySelector(".filter-name")?.addEventListener("click", () => applySavedFilter(idx));
    item.querySelector(".filter-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      getSavedFilters().splice(idx, 1);
      saveState();
      renderSavedFilters();
    });
    list.appendChild(item);
  });
}

export function renderActivity(): void {
  const feed = document.getElementById("activity-feed");
  if (!feed) return;
  feed.innerHTML = "";
  getActivityLog()
    .slice(0, 15)
    .forEach((a) => {
      const item = document.createElement("div");
      item.className = "activity-item";
      const ago = timeAgo(a.time);
      // Guard against nullish icon (legacy activity entries have
      // icon: null / text: null). `String(null) === "null"` matches
      // the regex below, which would then call lucideIcon("null", ...)
      // and crash on .replace(). The typeof gate is the only reliable
      // way to reject nullish values — see jirito-review §7.3.
      const iconHtml =
        typeof a.icon === "string" && /^[a-z0-9-]+$/.test(a.icon)
          ? lucideIcon(a.icon, { class: "icon-sm" })
          : "";
      item.innerHTML = `
      <span class="activity-icon">${iconHtml}</span>
      <span class="activity-text">${a.text}</span>
      <span class="activity-time">${ago}</span>
    `;
      feed.appendChild(item);
    });
}

export function switchProject(key: string): void {
  // Task 2.4: Validate key before use
  if (!getProjects()[key]) return;
  setCurrentProject(key);
  // Only adopt the project's issues when they are real issue objects
  // (the legacy localStorage format). In server mode, projects track an
  // array of issue ID strings and the global _issues list is the source
  // of truth — replacing it with strings would wipe the board.
  const projectIssues = getProjects()[key].issues;
  if (Array.isArray(projectIssues) && projectIssues.length > 0) {
    const firstItem = projectIssues[0];
    if (typeof firstItem === "object" && firstItem !== null && firstItem.id) {
      setIssues(projectIssues as Issue[]);
    }
  }
  renderSidebar();
  renderBoard();
  populateAssigneeFilter();
  const boardTitle = document.getElementById("board-title");
  if (boardTitle) {
    const proj = getProjects()[key];
    boardTitle.textContent = `${proj.icon} ${proj.name} — Board`;
  }
  // Update nav project name display
  const navName = document.getElementById("nav-project-name");
  if (navName) navName.textContent = getProjects()[key].name;
}

export function switchView(view: "board" | "list" | "calendar" | "dashboard"): void {
  setCurrentView(view);
  renderViews();
  // Re-render Phosphor icons after view changes so sidebar icons are visible
  const board = document.getElementById("board");
  const calendarSection = document.getElementById("calendar-section");
  const dashboardSection = document.getElementById("dashboard-section");
  const boardHeader = document
    .getElementById("board-title")
    ?.closest<HTMLElement>(".board-header");
  const bulkBar = document.getElementById("bulk-bar");

  // Update board title to reflect current view
  const boardTitle = document.getElementById("board-title");
  if (boardTitle && getProjects()[getCurrentProject()]) {
    const viewLabels: Record<string, string> = {
      board: "Board",
      list: "List",
      calendar: "Calendar",
      dashboard: "Dashboard",
    };
    const proj = getProjects()[getCurrentProject()];
    boardTitle.textContent = `${proj.icon} ${proj.name} — ${viewLabels[view] || "Board"}`;
  }

  // Hide all view containers and sidebar calendar/dashboard sections
  if (board) (board as HTMLElement).style.display = "none";
  const listView = document.getElementById("list-view") as HTMLElement | null;
  if (listView) listView.style.display = "none";
  const calendarContainer = document.getElementById(
    "calendar-container"
  ) as HTMLElement | null;
  if (calendarContainer) calendarContainer.style.display = "none";
  const dashboardContainer = document.getElementById(
    "dashboard-container"
  ) as HTMLElement | null;
  if (dashboardContainer) dashboardContainer.style.display = "none";
  if (calendarSection) (calendarSection as HTMLElement).style.display = "none";
  if (dashboardSection) (dashboardSection as HTMLElement).style.display = "none";

  // Show the appropriate view container
  if (view === "list") {
    if (!listView) {
      const newListView = document.createElement("div");
      newListView.id = "list-view";
      newListView.className = "list-view";
      board?.after(newListView);
    }
    if (listView) listView.style.display = "block";
    // Show board header (filters + sprint) for list view
    if (boardHeader) boardHeader.style.display = "flex";
    if (bulkBar) (bulkBar as HTMLElement).style.display = "none";
    renderListView();
  } else if (view === "calendar") {
    if (!calendarContainer) {
      const newCal = document.createElement("div");
      newCal.id = "calendar-container";
      newCal.className = "calendar-container";
      board?.after(newCal);
    }
    if (calendarContainer) calendarContainer.style.display = "block";
    // Keep board header visible on calendar view
    if (bulkBar) (bulkBar as HTMLElement).style.display = "none";
    renderCalendarView();
  } else if (view === "dashboard") {
    if (!dashboardContainer) {
      const newDash = document.createElement("div");
      newDash.id = "dashboard-container";
      newDash.className = "dashboard-container";
      board?.after(newDash);
    }
    if (dashboardContainer) dashboardContainer.style.display = "block";
    // Keep board header visible on dashboard view
    if (bulkBar) (bulkBar as HTMLElement).style.display = "none";
    renderDashboardView();
  } else {
    // Board view
    if (board) (board as HTMLElement).style.display = "flex";
    if (boardHeader) boardHeader.style.display = "flex";
    if (bulkBar) (bulkBar as HTMLElement).style.display = "none";
  }
}

export function renderListView(): void {
  const container = document.getElementById("list-view");
  if (!container) return;
  // Apply all filters (mirrors applyFilters() logic)
  const search = (document.getElementById("search-input") as HTMLInputElement | null)?.value.toLowerCase() || "";
  const typeFilter = (document.getElementById("filter-type") as HTMLSelectElement | null)?.value || "all";
  const priorityFilter = (document.getElementById("filter-priority") as HTMLSelectElement | null)?.value || "all";
  const assigneeFilter = (document.getElementById("filter-assignee") as HTMLSelectElement | null)?.value || "all";
  const sprintFilter = (document.getElementById("sprint-filter") as HTMLSelectElement | null)?.value || "all";
  const filtered = getIssues().filter((i) => {
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (priorityFilter !== "all" && i.priority !== priorityFilter) return false;
    if (assigneeFilter !== "all" && i.assignee !== assigneeFilter) return false;
    if (sprintFilter !== "all" && i.sprint !== sprintFilter) return false;
    if (
      search &&
      !i.title.toLowerCase().includes(search) &&
      !(i.desc || "").toLowerCase().includes(search)
    )
      return false;
    return true;
  });
  const columns = getEffectiveColumns();
  const statusOrder: Record<string, number> = {};
  columns.forEach((c, i) => {
    if (c.status) statusOrder[c.status] = i;
  });
  // Sort by rank (custom ordering) within each status group
  filtered.sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
    if (statusDiff !== 0) return statusDiff;
    return (a.rank ?? 0) - (b.rank ?? 0);
  });
  const projectKey = getProjectKey();
  // Read current sort state
  let sortCol = localStorage.getItem("listview-sort") || "key";
  let sortDir = localStorage.getItem("listview-dir") || "asc";
  const sortArrow = (col: string): string =>
    col === sortCol ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  container.innerHTML = `
    <table class="issue-table">
      <thead>
        <tr>
          <th class="sortable" data-sort="type">Type${sortArrow("type")}</th>
          <th class="sortable" data-sort="key">Key${sortArrow("key")}</th>
          <th class="sortable" data-sort="summary">Summary${sortArrow("summary")}</th>
          <th class="sortable" data-sort="sp">SP${sortArrow("sp")}</th>
          <th class="sortable" data-sort="priority">Priority${sortArrow("priority")}</th>
          <th class="sortable" data-sort="assignee">Assignee${sortArrow("assignee")}</th>
          <th class="sortable" data-sort="sprint">Sprint${sortArrow("sprint")}</th>
          <th class="sortable" data-sort="status">Status${sortArrow("status")}</th>
        </tr>
      </thead>
      <tbody>
        ${filtered
          .map((i) => {
            const sprintName = i.sprint ? getSprints()[i.sprint]?.name || "" : "";
            return `<tr data-id="${i.id}" class="list-row">
            <td>${lucideIcon(typeIcons[i.type] || "File", { class: "icon" })} ${escapeHtml(i.type)}</td>
            <td class="issue-key">${generateIssueKey(projectKey, i.id)}</td>
            <td>${escapeHtml(i.title)}</td>
            <td>${i.storyPoints || "—"}</td>
            <td><span class="issue-priority priority-${escapeHtml(i.priority)}">${escapeHtml(i.priority)}</span></td>
            <td>${escapeHtml(i.assignee || "—")}</td>
            <td>${escapeHtml(sprintName || "—")}</td>
            <td>${escapeHtml(i.status)}</td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll<HTMLElement>(".list-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      if (id) openDetailPanel(parseInt(id, 10));
    });
  });
  // Sortable column headers
  container.querySelectorAll<HTMLElement>(".sortable").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (!col) return;
      if (sortCol === col) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortCol = col;
        sortDir = "asc";
      }
      localStorage.setItem("listview-sort", sortCol);
      localStorage.setItem("listview-dir", sortDir);
      renderListView();
    });
  });
}

export function applySavedFilter(idx: number): void {
  const f = getSavedFilters()[idx];
  if (!f) return;
  const typeEl = document.getElementById("filter-type") as HTMLSelectElement | null;
  if (typeEl) typeEl.value = f.type || "all";
  const prioEl = document.getElementById("filter-priority") as HTMLSelectElement | null;
  if (prioEl) prioEl.value = f.priority || "all";
  const assigneeEl = document.getElementById("filter-assignee") as HTMLSelectElement | null;
  if (assigneeEl) {
    assigneeEl.value = f.assignee || "all";
  }
  applyFilters();
}

export function saveCurrentFilter(): void {
  const name = prompt("Name this filter:") || "Untitled";
  const typeEl = document.getElementById("filter-type") as HTMLSelectElement | null;
  const prioEl = document.getElementById("filter-priority") as HTMLSelectElement | null;
  const assigneeEl = document.getElementById("filter-assignee") as HTMLSelectElement | null;
  const f: SavedFilter = {
    name,
    type: typeEl?.value || "all",
    priority: prioEl?.value || "all",
    assignee: assigneeEl?.value || "all",
    query: {},
  };
  if (f.type === "all" && f.priority === "all" && f.assignee === "all") {
    showToast("Save a meaningful filter!", "error");
    return;
  }
  getSavedFilters().push(f);
  saveState();
  renderSavedFilters();
}

export function populateAssigneeFilter(): void {
  const assignees = [
    ...new Set(getIssues().map((i) => i.assignee).filter(Boolean) as string[]),
  ];
  const select = document.getElementById("filter-assignee") as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = '<option value="all">All Assignees</option>';
  assignees.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    select.appendChild(opt);
  });
  // Add labels option if any exist
  const allLabels = getAllLabels();
  if (allLabels.length > 0) {
    const labelOpt = document.createElement("option");
    labelOpt.value = "__labels__";
    labelOpt.textContent = "Labels...";
    select.appendChild(labelOpt);
  }
}


// ===== Test contract =====
//
// `tests/tests.spec.mjs` calls `switchProject('nonexistent-key')` from
// inside a `page.evaluate()` callback (the `switchProject with invalid
// key is a no-op` test) and then reads `getCurrentProject()` to confirm
// it stayed on `"default"`. The `page.evaluate` scope has no ES-module
// imports, so `switchProject` has to be reachable on `window`.
//
// This is a narrow, test-only concession — *not* a revival of the
// classic-script global. Real consumers should import from this
// module. Mirrors the test-contract block at the bottom of
// `src/state.ts` and the `window.storage` exposure in `src/storage.ts`.
try {
  if (typeof window !== "undefined") {
    (window as unknown as { switchProject?: typeof switchProject }).switchProject = switchProject;
  }
} catch {
  /* ignore — non-browser environment */
}
