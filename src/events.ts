/**
 * src/events.ts — Event handlers, detail panel, drag-and-drop, bulk
 * actions, filter, toast, and sprint-list rendering.
 *
 * Conversion notes (from src/events.js):
 *   - `LJ_CONSTANTS.HISTORY_MAX_ENTRIES` and `DEP_SEARCH_DEBOUNCE_MS` come
 *     from `./constants` instead of the legacy global. We destructure
 *     only the values used here.
 *   - All top-level functions get explicit return types (mostly `void`).
 *   - Cross-module function references are now real `import` statements
 *     (the `attach()` indirection was removed in plan §10.1).
 *   - The `typeIcons` lookup and `undoToast` reference are top-level
 *     `const`/`let` in `state.js`/`render.js`; they pollute the global
 *     scope in classic-script mode. We declare them at the bottom of
 *     this file as ambient globals.
 *   - The original `addEventListener("click", e => { ... if (e.target.id
 *     === 'undo-btn' && currentUndoCallback) ... })` block at the bottom
 *     of the file is preserved verbatim — it relies on the
 *     `currentUndoCallback` module-scope `let`.
 *
 * Behavior is preserved 1:1; only types and exports are added.
 */
import type { Comment, Dependency, Issue } from "./types";
import { CONSTANTS } from "./constants.js";
import { typeIcons } from "./state.js";
import {
  addActivity,
  addDependency,
  deleteSprint,
  getActiveSprint,
  getComments,
  getCurrentDetailIssue,
  getCurrentView,
  getEffectiveColumns,
  getIssueCounter,
  getIssues,
  getSelectedIds,
  getSprints,
  hasCircularDependency,
  isSelectedIssue,
  moveToTrash,
  removeDependency,
  saveState,
  setCurrentDetailIssue,
  setIssueCounter,
  setIssues,
} from "./state.js";
import {
  escapeHtml,
  formatDate,
  generateIssueKey,
  getProjectKey,
  lucideIcon,
  populateSprintFilter,
  populateSprintSelect,
  renderMarkdown,
  updateSprintBar,
  updateSprintProgressBar,
} from "./utils.js";
import {
  createCard,
  renderBoard,
  renderListView,
  updateCounts,
} from "./render.js";
import { renderTrash } from "./main-trash.js";
const HISTORY_MAX_ENTRIES = CONSTANTS.HISTORY_MAX_ENTRIES;
const DEP_SEARCH_DEBOUNCE_MS = CONSTANTS.DEP_SEARCH_DEBOUNCE_MS;
// Coerce both sides to string for ID comparison. After the server
// migration, issue ids are stored as numbers but the DOM (data-id) and
// URL params are always strings, so a strict === would always fail.
function _matchesId(issue: Issue | null | undefined, id: Issue["id"] | null | undefined): boolean {
  if (issue == null || id == null) return false;
  return String(issue.id) === String(id);
}
// ===== Drag & Drop State =====
let draggedId: string | null = null;
void draggedId;
let draggedCard: HTMLElement | null = null;
void draggedCard;
let draggedSource: { columnId: string; index: number } | null = null;
void draggedSource;
let draggedTarget: { columnId: string; index: number; edge: "top" | "bottom" } | null = null;
// ===== Drag & Drop Helpers =====
function getClosestEdge(mouseY: number, rect: DOMRect): "top" | "bottom" {
  const midpoint = rect.top + rect.height / 2;
  return mouseY < midpoint ? "top" : "bottom";
}
function insertDropIndicator(
  col: HTMLElement,
  targetCard: HTMLElement | null,
  edge: "top" | "bottom"
): void {
  // Remove existing indicators
  col.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
  const indicator = document.createElement("div");
  indicator.className = "drop-indicator";
  if (!targetCard) {
    // Empty column or past last card — append
    col.appendChild(indicator);
    return;
  }
  if (edge === "top") {
    col.insertBefore(indicator, targetCard);
  } else {
    // Insert after targetCard
    const next = targetCard.nextElementSibling;
    if (next) {
      col.insertBefore(indicator, next);
    } else {
      col.appendChild(indicator);
    }
  }
}
function removeDropIndicators(): void {
  document.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
}
function getCardPosition(cardEl: HTMLElement): { columnId: string; index: number } {
  const col = cardEl.closest<HTMLElement>(".column-body");
  if (!col) return { columnId: "", index: -1 };
  const cards = Array.from(
    col.querySelectorAll<HTMLElement>(".issue-card:not(.dragging)")
  );
  return {
    columnId: col.dataset.colId ?? "",
    index: cards.findIndex((c) => c === cardEl),
  };
}
// ===== Detail Panel =====
let _detailChangeHandler: ((e: Event) => void) | null = null;
let _detailCommentClickHandler: ((e: Event) => void) | null = null;
let _detailCommentKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
// Clone and delete buttons live in the persistent detail-panel-header (see
// index.html). The header is NEVER re-rendered, so a naive addEventListener
// here stacks one new listener per openDetailPanel() call. After N opens,
// one click fires N clones / N confirmations / N deletions (each closure
// captured a different issueId, so all the tickets the user opened get
// nuked). Track the previous handler in a module-level var and remove it
// before adding the new one — same pattern as _detailChangeHandler and the
// comment handlers below.
let _detailCloneClickHandler: (() => void) | null = null;
let _detailDeleteClickHandler: (() => void) | null = null;
export function openDetailPanel(issueId: Issue["id"]): void {
  const issue = getIssues().find((i) => _matchesId(i, issueId));
  if (!issue) return;
  setCurrentDetailIssue(issue);
  const panel = document.getElementById("detail-panel");
  const body = document.getElementById("detail-body");
  const statusBar = document.getElementById("detail-status-bar");
  if (!panel || !body || !statusBar) return;
  const projectKey = getProjectKey();
  const key = generateIssueKey(projectKey, issue.id);
  document.getElementById("detail-title")!.textContent = `${key}: ${issue.title}`;
  // Build labels HTML (kept for parity with the original detail-panel
  // template; currently the labels are rendered via `issue.labels` array
  // inside the comments list — see detail-body innerHTML below).
  let labelsHtml = "";
  void labelsHtml;
  if (issue.labels && issue.labels.length > 0) {
    labelsHtml = `<div class="detail-labels">${issue.labels
      .map((l) => `<span class="issue-label">${escapeHtml(l)}</span>`)
      .join("")}</div>`;
  }
  // Build history HTML
  let historyHtml = "";
  if (issue.history && issue.history.length > 0) {
    historyHtml = issue.history
      .slice(-HISTORY_MAX_ENTRIES)
      .reverse()
      .map(
        (h) => `
      <div class="history-entry">
        <span class="history-field">${escapeHtml(h.field)}</span>
        <span class="history-arrow">→</span>
        <span class="history-from">${escapeHtml(h.from || "—")}</span>
        <span class="history-to">${escapeHtml(h.to)}</span>
        <span class="history-date">${new Date(h.date).toLocaleString()}</span>
      </div>
    `
      )
      .join("");
  }
  body.innerHTML = `
    <div class="detail-field">
      <label>Type</label>
      <div class="value">${lucideIcon(typeIcons[issue.type] || "File", { class: "icon" })} ${escapeHtml(issue.type.charAt(0).toUpperCase() + issue.type.slice(1))}</div>
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
            ${lucideIcon("Eye", { class: "icon-sm" })} Preview
          </button>
          <button class="btn btn-sm btn-markdown-help" title="Markdown syntax help">
            ${lucideIcon("Question", { class: "icon-sm" })}
          </button>
        </div>
        <textarea id="detail-desc" class="markdown-textarea">${escapeHtml(issue.desc || "")}</textarea>
        <div id="detail-desc-preview" class="markdown-preview" style="display:none;"></div>
      </div>
    </div>
    <div class="detail-field">
      <label>Priority</label>
      <select id="detail-priority">
        <option value="high" ${issue.priority === "high" ? "selected" : ""}>High</option>
        <option value="medium" ${issue.priority === "medium" ? "selected" : ""}>Medium</option>
        <option value="low" ${issue.priority === "low" ? "selected" : ""}>Low</option>
      </select>
    </div>
    <div class="detail-field">
      <label>Assignee</label>
      <input type="text" id="detail-assignee" value="${escapeHtml(issue.assignee || "")}">
    </div>
    <div class="detail-field">
      <label>Labels</label>
      <input type="text" id="detail-labels" value="${(issue.labels || []).join(", ")}" placeholder="Comma-separated labels">
    </div>
    <div class="detail-field">
      <label>Due Date</label>
      <input type="date" id="detail-due-date" value="${issue.dueDate || ""}">
    </div>
    <div class="detail-field">
      <label>Story Points</label>
      <input type="number" id="detail-story-points" min="0" max="100" value="${issue.storyPoints || ""}" placeholder="0">
    </div>
    <div class="detail-field">
      <label>PR URL</label>
      <input type="url" id="detail-pr-url" value="${escapeHtml(issue.prUrl || "")}" placeholder="https://github.com/owner/repo/pull/1">
    </div>
    <div class="detail-field">
      <label>PR Merged</label>
      <input type="checkbox" id="detail-pr-merged" ${issue.prMerged ? "checked" : ""}>
    </div>
    <div class="detail-field">
      <label>Sprint</label>
      <select id="detail-sprint">
        <option value="">No Sprint</option>
        ${Object.values(getSprints())
          .map(
            (s) =>
              `<option value="${s.id}" ${issue.sprint === s.id ? "selected" : ""}>${escapeHtml(s.name)} (${formatDate(s.startDate)} - ${formatDate(s.endDate)})</option>`
          )
          .join("")}
      </select>
    </div>
    <div class="detail-field">
      <label>Dependencies</label>
      <div id="detail-dependencies">
        ${(issue.dependencies || [])
          .map((d) => {
            const target = getIssues().find((i) => _matchesId(i, d.targetId));
            const targetKey = target ? generateIssueKey(getProjectKey(), target.id) : "Unknown";
            const typeIcon = d.type === "blocks" ? "TriangleAlert" : "Link";
            return `<div class="dep-entry">
            ${lucideIcon(typeIcon, { class: "icon-sm" })}
            <span class="dep-key">${targetKey}</span>
            <span class="dep-type">${d.type === "blocks" ? "blocks" : "relates to"}</span>
            <button class="dep-remove" data-target-id="${d.targetId}" data-type="${d.type}" title="Remove dependency">&times;</button>
          </div>`;
          })
          .join("")}
        ${!issue.dependencies || issue.dependencies.length === 0 ? '<span class="history-empty">No dependencies</span>' : ""}
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
      <h3>Comments</h3>
      <span id="comment-count" class="comment-count-badge">${(getComments()[issue.id] || []).length}</span>
      <div id="comments-list">
        ${(getComments()[issue.id] || [])
          .map(
            (c) => `
          <div class="comment">
            <div class="comment-header">
              <span class="comment-author">${escapeHtml(c.author)}</span>
              <span class="comment-date">${new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <div class="comment-text markdown-content">${renderMarkdown(c.content)}</div>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="markdown-editor">
        <div class="markdown-editor-toolbar">
          <button class="btn btn-sm btn-format" data-format="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
          <button class="btn btn-sm btn-format" data-format="italic" title="Italic (Ctrl+I)"><em>I</em></button>
          <button class="btn btn-sm btn-format" data-format="link" title="Insert link">🔗</button>
          <button class="btn btn-sm btn-format" data-format="code" title="Inline code">&lt;&gt;</button>
          <button class="btn btn-sm btn-format" data-format="codeblock" title="Code block">▤</button>
          <button class="btn btn-sm btn-markdown-toggle" data-target="comment-input" data-issue-id="${issue.id}" title="Toggle markdown preview">
            ${lucideIcon("Eye", { class: "icon-sm" })} Preview
          </button>
          <button class="btn btn-sm btn-markdown-help" title="Markdown syntax help">
            ${lucideIcon("Question", { class: "icon-sm" })}
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
    body.removeEventListener("change", _detailChangeHandler);
  }
  // Wire up save button using event delegation to avoid duplicate listeners
  _detailChangeHandler = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (target.id === "detail-summary") {
      const oldTitle = issue.title;
      trackHistory(issue, "title", oldTitle, (target as HTMLInputElement).value);
      issue.title = (target as HTMLInputElement).value;
      saveState();
      renderBoard();
      document.getElementById("detail-title")!.textContent = `${key}: ${(target as HTMLInputElement).value}`;
      addActivity("Pencil", "Summary updated");
      showUndoToast("Summary changed", () => {
        issue.title = oldTitle;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Summary restored", "success");
      });
    } else if (target.id === "detail-desc") {
      const oldDesc = issue.desc || "";
      trackHistory(issue, "description", oldDesc, (target as HTMLTextAreaElement).value);
      issue.desc = (target as HTMLTextAreaElement).value;
      saveState();
      addActivity("FileText", "Description updated");
      showUndoToast("Description changed", () => {
        issue.desc = oldDesc;
        saveState();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Description restored", "success");
      });
    } else if (target.id === "detail-priority") {
      const oldPriority = issue.priority;
      trackHistory(issue, "priority", oldPriority, (target as HTMLSelectElement).value);
      issue.priority = (target as HTMLSelectElement).value as Issue["priority"];
      saveState();
      renderBoard();
      addActivity("Flag", "Priority updated");
      showUndoToast("Priority changed", () => {
        issue.priority = oldPriority;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Priority restored", "success");
      });
    } else if (target.id === "detail-assignee") {
      const oldAssignee = issue.assignee || "";
      trackHistory(issue, "assignee", oldAssignee, (target as HTMLInputElement).value);
      issue.assignee = (target as HTMLInputElement).value;
      saveState();
      renderBoard();
      addActivity("User", "Assignee updated");
      showUndoToast("Assignee changed", () => {
        issue.assignee = oldAssignee;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Assignee restored", "success");
      });
    } else if (target.id === "detail-labels") {
      const oldLabels = (issue.labels || []).join(", ");
      const labels = (target as HTMLInputElement).value
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      trackHistory(issue, "labels", oldLabels, labels.join(", "));
      issue.labels = labels;
      saveState();
      renderBoard();
      addActivity("Tag", "Labels updated");
      showUndoToast("Labels changed", () => {
        issue.labels = oldLabels
          ? oldLabels.split(",").map((l) => l.trim()).filter(Boolean)
          : [];
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Labels restored", "success");
      });
    } else if (target.id === "detail-due-date") {
      const oldDate = issue.dueDate;
      issue.dueDate = (target as HTMLInputElement).value || null;
      if (oldDate !== issue.dueDate) {
        trackHistory(issue, "due date", oldDate || "None", issue.dueDate || "None");
      }
      saveState();
      renderBoard();
      addActivity("Calendar", "Due date updated");
      showUndoToast("Due date changed", () => {
        issue.dueDate = oldDate;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Due date restored", "success");
      });
    } else if (target.id === "detail-story-points") {
      const oldSP = issue.storyPoints;
      issue.storyPoints = (target as HTMLInputElement).value
        ? parseInt((target as HTMLInputElement).value, 10)
        : null;
      if (oldSP !== issue.storyPoints) {
        trackHistory(issue, "story points", oldSP || "0", issue.storyPoints || "0");
      }
      saveState();
      renderBoard();
      addActivity("Target", "Story points updated");
      showUndoToast("Story points changed", () => {
        issue.storyPoints = oldSP;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Story points restored", "success");
      });
    } else if (target.id === "detail-pr-url") {
      const oldPrUrl = issue.prUrl || "";
      issue.prUrl = (target as HTMLInputElement).value || undefined;
      if (oldPrUrl !== (issue.prUrl || "")) {
        trackHistory(issue, "PR URL", oldPrUrl || "none", issue.prUrl || "none");
      }
      saveState();
      renderBoard();
      addActivity("GitPullRequest", "PR URL updated");
      showUndoToast("PR URL changed", () => {
        issue.prUrl = oldPrUrl || undefined;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("PR URL restored", "success");
      });
    } else if (target.id === "detail-pr-merged") {
      const oldMerged = !!issue.prMerged;
      issue.prMerged = (target as HTMLInputElement).checked;
      if (oldMerged !== issue.prMerged) {
        trackHistory(issue, "PR merged", String(oldMerged), String(issue.prMerged));
      }
      saveState();
      renderBoard();
      addActivity("GitMerge", "PR merge status updated");
      showUndoToast("PR merged changed", () => {
        issue.prMerged = oldMerged;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("PR merged restored", "success");
      });
    } else if (target.id === "detail-sprint") {
      const oldSprint = issue.sprint;
      issue.sprint = (target as HTMLSelectElement).value || null;
      if (oldSprint !== issue.sprint) {
        trackHistory(issue, "sprint", oldSprint || "None", issue.sprint || "None");
      }
      saveState();
      renderBoard();
      addActivity("Lightning", "Sprint updated");
      showUndoToast("Sprint changed", () => {
        issue.sprint = oldSprint;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Sprint restored", "success");
      });
    }
  };
  body.addEventListener("change", _detailChangeHandler);
  // Remove previous comment handlers to prevent duplicates
  const prevCommentSubmit = body.querySelector<HTMLButtonElement>("#comment-submit");
  const prevCommentInput = body.querySelector<HTMLTextAreaElement>("#comment-input");
  if (_detailCommentClickHandler && prevCommentSubmit) {
    prevCommentSubmit.removeEventListener("click", _detailCommentClickHandler);
  }
  if (_detailCommentKeydownHandler && prevCommentInput) {
    prevCommentInput.removeEventListener("keydown", _detailCommentKeydownHandler);
  }
  // Wire up comment submit using event delegation
  _detailCommentClickHandler = addComment as unknown as (e: Event) => void;
  _detailCommentKeydownHandler = (e: KeyboardEvent) => {
    if (e.key === "Enter") addComment();
  };
  if (prevCommentSubmit) {
    prevCommentSubmit.addEventListener("click", _detailCommentClickHandler);
  }
  if (prevCommentInput) {
    prevCommentInput.addEventListener("keydown", _detailCommentKeydownHandler);
  }
  // Status buttons
  statusBar.innerHTML = ["todo", "inprogress", "review", "done"]
    .map((s) => {
      const labels: Record<string, string> = {
        todo: "To Do",
        inprogress: "In Progress",
        review: "In Review",
        done: "Done",
      };
      const active = issue.status === s ? "active" : "";
      return `<button class="detail-status-btn ${active}" data-status="${s}">${labels[s]}</button>`;
    })
    .join("");
  statusBar.querySelectorAll<HTMLButtonElement>(".detail-status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const oldStatus = issue.status;
      const newStatus = btn.dataset.status ?? oldStatus;
      issue.status = newStatus;
      trackHistory(issue, "status", oldStatus, newStatus);
      saveState();
      renderBoard();
      openDetailPanel(issue.id); // Refresh panel
      const statusLabels: Record<string, string> = {
        todo: "To Do",
        inprogress: "In Progress",
        review: "In Review",
        done: "Done",
      };
      addActivity("ArrowRight", "Status updated");
      showUndoToast(`Moved to ${statusLabels[newStatus]}`, () => {
        issue.status = oldStatus;
        saveState();
        renderBoard();
        openDetailPanel(issue.id);
        removeUndoToast();
        showToast("Status restored", "success");
      });
    });
  });
  // Clone button — remove previous handler before adding the new one so we
  // don't stack listeners on the persistent detail-panel-header button.
  // (The dev comment about "{ once: true }" on delete was correct in spirit
  // but `{ once: true }` does NOT prevent `addEventListener` from being
  // called multiple times — it only ensures each registered listener fires
  // once. After N panel opens you have N listeners, each with once: true,
  // each firing on the next N clicks. The track-and-remove pattern is the
  // only correct fix.)
  const deleteBtn = document.getElementById("delete-issue-btn");
  const cloneBtn = document.getElementById("clone-issue-btn");
  if (cloneBtn) {
    (cloneBtn as HTMLElement).style.display = "inline-flex";
    if (_detailCloneClickHandler) {
      cloneBtn.removeEventListener("click", _detailCloneClickHandler);
    }
    _detailCloneClickHandler = () => cloneIssue(issueId);
    cloneBtn.addEventListener("click", _detailCloneClickHandler);
  }
  // Delete button — same track-and-remove pattern as clone.
  if (deleteBtn) {
    if (_detailDeleteClickHandler) {
      deleteBtn.removeEventListener("click", _detailDeleteClickHandler);
    }
    _detailDeleteClickHandler = () => deleteIssue(issueId);
    deleteBtn.addEventListener("click", _detailDeleteClickHandler);
  }
  // Dependency removal
  const depContainer = document.getElementById("detail-dependencies");
  if (depContainer) {
    depContainer.querySelectorAll<HTMLButtonElement>(".dep-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.targetId;
        const type = btn.dataset.type;
        if (targetId && type) {
          removeDependency(issueId, targetId, type as Dependency["type"]);
          showToast("Dependency removed", "success");
          openDetailPanel(issueId);
        }
      });
    });
  }
  // Dependency search
  const depSearch = document.getElementById("dep-search") as HTMLInputElement | null;
  const depAddBtn = document.getElementById("dep-add-btn");
  const depResults = document.getElementById("dep-search-results");
  if (depSearch && depAddBtn && depResults) {
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    depSearch.addEventListener("input", () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = depSearch.value.trim().toUpperCase();
        if (!query) {
          (depResults as HTMLElement).style.display = "none";
          return;
        }
        const matches = getIssues()
          .filter((i) => {
            if (_matchesId(i, issueId)) return false;
            const key = generateIssueKey(getProjectKey(), i.id);
            const titleMatch = (i.title || "").toUpperCase().includes(query);
            const keyMatch = key.toUpperCase().includes(query);
            return titleMatch || keyMatch;
          })
          .slice(0, 10);
        if (matches.length === 0) {
          (depResults as HTMLElement).style.display = "none";
          return;
        }
        depResults.innerHTML = matches
          .map((m) => {
            const key = generateIssueKey(getProjectKey(), m.id);
            return `<div class="dep-result-item" data-id="${m.id}">${key}: ${escapeHtml(m.title)}</div>`;
          })
          .join("");
        (depResults as HTMLElement).style.display = "block";
        depResults.querySelectorAll<HTMLElement>(".dep-result-item").forEach((item) => {
          item.addEventListener("click", () => {
            const targetId = item.dataset.id;
            const typeSelect = document.getElementById("dep-type") as HTMLSelectElement | null;
            const type = typeSelect?.value ?? "relates-to";
            if (!targetId) return;
            // Self-dependency: explicit, type-tolerant check (the type
            // mismatch on ids makes hasCircularDependency unreliable here).
            if (String(issueId) === String(targetId)) {
              showToast("Cannot add: would create a circular dependency", "error");
              return;
            }
            if (hasCircularDependency(issueId, targetId)) {
              showToast("Cannot add: would create a circular dependency", "error");
              return;
            }
            addDependency(issueId, targetId, type as Dependency["type"]);
            showToast(`Depended on ${generateIssueKey(getProjectKey(), targetId)}`, "success");
            depSearch.value = "";
            (depResults as HTMLElement).style.display = "none";
            openDetailPanel(issueId);
          });
        });
      }, DEP_SEARCH_DEBOUNCE_MS);
    });
    depAddBtn.addEventListener("click", () => {
      const query = depSearch.value.trim().toUpperCase();
      if (!query) return;
      const match = getIssues().find((i) => {
        const key = generateIssueKey(getProjectKey(), i.id).toUpperCase();
        return key.includes(query) && !_matchesId(i, issueId);
      });
      if (match) {
        const typeSelect = document.getElementById("dep-type") as HTMLSelectElement | null;
        const type = typeSelect?.value ?? "relates-to";
        if (hasCircularDependency(issueId, match.id)) {
          showToast("Cannot add: would create a circular dependency", "error");
          return;
        }
        addDependency(issueId, match.id, type as Dependency["type"]);
        showToast(`Depended on ${generateIssueKey(getProjectKey(), match.id)}`, "success");
        depSearch.value = "";
        (depResults as HTMLElement).style.display = "none";
        openDetailPanel(issueId);
      }
    });
  }
  panel.classList.add("open");
  // Show backdrop
  const backdrop = document.getElementById("detail-backdrop");
  if (backdrop) {
    (backdrop as HTMLElement).style.display = "block";
    // Force reflow for transition
    backdrop.offsetHeight;
    backdrop.classList.add("visible");
  }
  // Render Phosphor icons in the detail panel
  // Initialize markdown toggles
  initMarkdownToggles();
}
export function trackHistory(
  issue: Issue,
  field: string,
  from: string | number | null | undefined,
  to: string | number | null | undefined
): void {
  if (!issue.history) issue.history = [];
  issue.history.push({
    field,
    from: String(from ?? ""),
    to: String(to ?? ""),
    date: new Date().toISOString(),
    user: "You",
  });
  // Limit history to last HISTORY_MAX_ENTRIES entries
  if (issue.history.length > HISTORY_MAX_ENTRIES) {
    issue.history = issue.history.slice(-HISTORY_MAX_ENTRIES);
  }
  saveState();
}
export function deleteIssue(issueId: Issue["id"]): void {
  if (!confirm("Delete this issue? You can restore it from Trash.")) return;
  const issues = getIssues();
  const idx = issues.findIndex((i) => _matchesId(i, issueId));
  if (idx === -1) return;
  const title = issues[idx].title;
  const issue = issues.splice(idx, 1)[0];
  delete getComments()[issueId];
  // Move to trash instead of deleting
  moveToTrash(issue);
  addActivity(`Trash`, `Deleted issue: ${title}`);
  closeDetailPanel();
  renderBoard();
  updateCounts();
  renderTrash();
  showToast("Issue moved to trash", "success");
  // Wire up undo
  showUndoToast("Issue deleted", () => {
    getIssues().push(issue);
    getComments()[issueId] = getComments()[issueId] || [];
    saveState();
    renderBoard();
    updateCounts();
    removeUndoToast();
    showToast("Issue restored", "success");
  });
}
export function closeDetailPanel(): void {
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("detail-backdrop");
  if (panel) panel.classList.remove("open");
  if (backdrop) {
    backdrop.classList.remove("visible");
    (backdrop as HTMLElement).style.display = "none";
  }
  setCurrentDetailIssue(null);
}
export function addComment(): void {
  if (!getCurrentDetailIssue()) return;
  const input = document.getElementById("comment-input") as HTMLTextAreaElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const currentIssue = getCurrentDetailIssue();
  if (!currentIssue) return;
  const issueId = currentIssue.id;
  if (!getComments()[issueId]) getComments()[issueId] = [];
  const commentIdx = getComments()[issueId].length;
  // JIRITO-121: was `{author, text, date}` — wrong field names. The
  // server's `Comment` shape and DB schema are `{id, issueId, content,
  // author, createdAt, updatedAt}`. Using `{text, date}` meant UI-comments
  // saved with the old shape and server comments (from agents) returned
  // a different shape, so rendering tried to read `c.date`/`c.text` and
  // got undefined → "Invalid Date" + blank text for agent comments.
  // Now we use the canonical shape end-to-end; both UI-added and
  // server-returned comments render correctly.
  getComments()[issueId].push({
    id: `cmt_local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    issueId,
    author: "You",
    content: text,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Comment);
  saveState();
  openDetailPanel(issueId); // Refresh
  renderBoard(); // Update comment count badge
  addActivity("MessageCircle", "Comment added");
  showUndoToast("Comment added", () => {
    getComments()[issueId].splice(commentIdx, 1);
    saveState();
    openDetailPanel(issueId);
    renderBoard();
    removeUndoToast();
    showToast("Comment removed", "success");
  });
}
// ===== Markdown Toggle =====
export function initMarkdownToggles(): void {
  // Quick format buttons
  document.querySelectorAll<HTMLButtonElement>(".btn-format").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const format = btn.dataset.format;
      const textarea = btn
        .closest(".markdown-editor, .comment-form")
        ?.querySelector<HTMLTextAreaElement>("textarea");
      if (!textarea || !format) return;
      textarea.focus();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.substring(start, end);
      let replacement = "";
      switch (format) {
        case "bold":
          replacement = "**" + (selected || "bold text") + "**";
          break;
        case "italic":
          replacement = "*" + (selected || "italic text") + "*";
          break;
        case "link":
          replacement = "[" + (selected || "link text") + "](url)";
          break;
        case "code":
          replacement = "`" + (selected || "code") + "`";
          break;
        case "codeblock":
          replacement = "```\n" + (selected || "code here") + "\n```";
          break;
      }
      textarea.value =
        textarea.value.substring(0, start) +
        replacement +
        textarea.value.substring(end);
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".btn-markdown-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      if (!targetId) return;
      const textarea = document.getElementById(targetId) as HTMLTextAreaElement | null;
      const preview = document.getElementById(targetId + "-preview");
      if (!textarea || !preview) return;
      if ((preview as HTMLElement).style.display === "none") {
        preview.innerHTML = renderMarkdown(textarea.value);
        (preview as HTMLElement).style.display = "block";
        textarea.style.display = "none";
        btn.innerHTML = lucideIcon("Pencil", { class: "icon-sm" }) + " Edit";
      } else {
        (preview as HTMLElement).style.display = "none";
        textarea.style.display = "block";
        btn.innerHTML = lucideIcon("Eye", { class: "icon-sm" }) + " Preview";
      }
    });
  });
  // Markdown help tooltip
  document.querySelectorAll<HTMLButtonElement>(".btn-markdown-help").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const help = document.createElement("div");
      help.className = "markdown-help-tooltip";
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
      help.style.cssText =
        "position:absolute;top:100%;right:0;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:12px;z-index:70;box-shadow:0 4px 12px var(--shadow);max-width:280px;line-height:1.6;";
      const parent = btn.closest<HTMLElement>(
        ".markdown-editor-toolbar, .comment-form-toolbar"
      );
      if (parent) {
        parent.style.position = "relative";
        parent.appendChild(help);
      }
      setTimeout(() => {
        const closeHelp = (ev: Event) => {
          if (!help.contains(ev.target as Node)) {
            help.remove();
            document.removeEventListener("click", closeHelp);
          }
        };
        document.addEventListener("click", closeHelp);
      }, 10);
    });
  });
}
export function cloneIssue(issueId: Issue["id"]): void {
  const issue = getIssues().find((i) => _matchesId(i, issueId));
  if (!issue) return;
  const newId = getIssueCounter() + 1;
  setIssueCounter(newId);
  const newIssue: Issue = {
    id: newId,
    title: issue.title + " (clone)",
    desc: issue.desc || "",
    type: issue.type,
    priority: issue.priority,
    assignee: issue.assignee,
    status: "todo",
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
  addActivity("copy", `Cloned issue to <strong>${newKey}</strong>`);
  showToast(`Issue cloned as ${newKey}`, "success");
  openDetailPanel(newIssue.id);
  showUndoToast(`Cloned to ${newKey}`, () => {
    const idx = getIssues().findIndex((i) => _matchesId(i, newIssue.id));
    if (idx !== -1) {
      getIssues().splice(idx, 1);
      delete getComments()[newIssue.id];
      saveState();
      renderBoard();
      updateCounts();
      renderTrash();
    }
    removeUndoToast();
    showToast("Clone deleted", "success");
  });
}
// ===== Drag & Drop =====
export function initDragDrop(): void {
  // Remove existing listeners by cloning column-bodies
  document.querySelectorAll(".column-body").forEach((col) => {
    const newCol = col.cloneNode(true);
    col.parentNode?.replaceChild(newCol, col);
  });
  // Re-attach card click handlers via event delegation on column-body
  document.querySelectorAll<HTMLElement>(".column-body").forEach((col) => {
    col.addEventListener("click", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".issue-card");
      if (!card || card.classList.contains("dragging")) return;
      const id = card.dataset.id;
      if (id) openDetailPanel(id);
    });
    col.addEventListener("keydown", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".issue-card");
      if (!card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const id = card.dataset.id;
        if (id) openDetailPanel(id);
      }
    });
    // Re-attach checkbox change handler via event delegation
    col.addEventListener("change", (e) => {
      const checkbox = (e.target as HTMLElement).closest<HTMLInputElement>(".issue-checkbox");
      if (!checkbox) return;
      const id = checkbox.dataset.id;
      if (id) {
        // JIRITO-122 (regression): the per-card `change` handler in
        // src/render.ts also adds the issue.id to `_selectedIds`. When
        // both fire on the same event the Set ends up with both forms
        // (`101` and `"101"`) and `updateBulkBar` reports "2 selected"
        // for one click. The render.ts path uses `issue.id` (number);
        // the events.ts path uses `checkbox.dataset.id` (string). They
        // are not idempotent — pick one. We already capture the most
        // up-to-date issue by id here, so use it instead of the DOM
        // dataset string to keep the Set entry shape consistent with
        // issue.id.
        const issue = getIssues().find((x) => String(x.id) === id);
        const canonId = issue ? issue.id : id;
        if (checkbox.checked) getSelectedIds().add(canonId);
        else getSelectedIds().delete(canonId);
        updateBulkBar();
      }
    });
  });
  // Re-attach drag events via event delegation on column-body
  document.querySelectorAll<HTMLElement>(".column-body").forEach((col) => {
    // Phase 1: Drag Start
    col.addEventListener("dragstart", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".issue-card");
      if (!card) return;
      draggedId = card.dataset.id ?? null;
      draggedCard = card;
      // Phase 1: Mark as dragging
      card.classList.add("dragging");
      // Phase 1: Store source position
      const pos = getCardPosition(card);
      draggedSource = pos;
      // Phase 1: Create custom drag image (card preview under cursor)
      const rect = card.getBoundingClientRect();
      if (e.dataTransfer) {
        e.dataTransfer.setDragImage(
          card,
          e.clientX - rect.left,
          e.clientY - rect.top
        );
        // Phase 1: Set drag data
        e.dataTransfer.setData("text/plain", String(card.dataset.id));
        e.dataTransfer.effectAllowed = "move";
      }
    });
    // Phase 2: Drag Over
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      col.classList.add("drag-over");
      // Find which card we're over and where the indicator should go
      const cards = Array.from(
        col.querySelectorAll<HTMLElement>(".issue-card:not(.dragging)")
      );
      let targetCard: HTMLElement | null = null;
      let closestEdge: "top" | "bottom" | null = null;
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const edge = getClosestEdge(e.clientY, rect);
        // If over top half → insert before this card (break here)
        // If over bottom half → continue to next card (indicator goes after this one)
        if (edge === "top") {
          targetCard = card;
          closestEdge = edge;
          break;
        }
      }
      if (targetCard && closestEdge) {
        insertDropIndicator(col, targetCard, closestEdge);
        draggedTarget = {
          columnId: col.dataset.colId ?? "",
          index: cards.indexOf(targetCard),
          edge: closestEdge,
        };
      } else if (cards.length > 0) {
        // Past the last card — drop at bottom
        insertDropIndicator(col, cards[cards.length - 1], "bottom");
        draggedTarget = {
          columnId: col.dataset.colId ?? "",
          index: cards.length,
          edge: "bottom",
        };
      } else {
        // Empty column — use column body rect to determine position
        const colRect = col.getBoundingClientRect();
        const colMidpoint = colRect.top + colRect.height / 2;
        const edge: "top" | "bottom" =
          e.clientY < colMidpoint ? "top" : "bottom";
        draggedTarget = { columnId: col.dataset.colId ?? "", index: 0, edge };
        // Show indicator at the appropriate position in the empty column
        col.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
        const indicator = document.createElement("div");
        indicator.className = "drop-indicator";
        if (edge === "top") {
          col.prepend(indicator);
        } else {
          col.appendChild(indicator);
        }
      }
    });
    col.addEventListener("dragleave", (e) => {
      // Only remove if the mouse actually left the column
      // (not just moving between child elements)
      const rect = col.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        col.classList.remove("drag-over");
        removeDropIndicators();
      }
    });
    // Phase 3: Drop
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      removeDropIndicators();
      const id = e.dataTransfer?.getData("text/plain") ?? "";
      const issue = getIssues().find((i) => String(i.id) === String(id));
      if (!issue) return;
      const colId = col.dataset.colId ?? "";
      const colDef = getEffectiveColumns().find((c) => c.id === colId);
      const isCustomColumn = colDef && !colDef.status;
      const newStatus = colDef?.status || col.dataset.status;
      const oldStatus = issue.status;
      const oldCustomColumnId = issue.customColumnId;
      // Determine if this is a same-column operation
      const sameColumn = isCustomColumn
        ? issue.customColumnId === colId // Custom column: compare customColumnId
        : (colDef && colDef.status && issue.status === newStatus); // Status column: compare status
      // Calculate destination index from the visual indicator position
      const targetCards = Array.from(
        col.querySelectorAll<HTMLElement>(".issue-card:not(.dragging)")
      );
      let finalIndex: number;
      if (
        draggedTarget?.edge === "bottom" &&
        draggedTarget?.index === 0 &&
        targetCards.length === 0
      ) {
        // Empty column — insert at index 0
        finalIndex = 0;
      } else {
        finalIndex = draggedTarget?.index ?? 0;
        if (draggedTarget?.edge === "bottom") {
          finalIndex = draggedTarget.index + 1;
        }
      }
      if (sameColumn) {
        // Reorder within same column — use floating-point rank for smooth insertion
        const beforeCards = Array.from(
          col.querySelectorAll<HTMLElement>(".issue-card:not(.dragging)")
        ).slice(0, finalIndex);
        const afterCards = Array.from(
          col.querySelectorAll<HTMLElement>(".issue-card:not(.dragging)")
        ).slice(finalIndex);
        const beforeIssue =
          beforeCards.length > 0
            ? getIssues().find((i) =>
                _matchesId(i, beforeCards[beforeCards.length - 1].dataset.id)
              )
            : null;
        const afterIssue =
          afterCards.length > 0
            ? getIssues().find((i) => _matchesId(i, afterCards[0].dataset.id))
            : null;
        const beforeRank = beforeIssue?.rank ?? -1;
        const afterRank = afterIssue?.rank ?? (beforeRank >= 0 ? beforeRank + 1 : 1);
        issue.rank = (beforeRank + afterRank) / 2;
        saveState();
        renderBoard();
        updateCounts();
        addActivity("ArrowUpDown", "Card reordered");
        showUndoToast("Card reordered", () => {
          issue.rank = beforeIssue?.rank ?? afterIssue?.rank ?? 0;
          saveState();
          renderBoard();
          updateCounts();
          removeUndoToast();
          showToast("Reorder undone", "success");
        });
      } else {
        // Move to different column — insert at finalIndex position
        // Determine target issues based on column type
        const targetIssues = isCustomColumn
          ? getIssues().filter((i) => i.customColumnId === colId)
          : getIssues().filter((i) => i.status === newStatus);
        const targetCount = targetIssues.length;
        if (finalIndex >= targetCount) {
          // Dropping past the last card — append
          const maxRank =
            targetCount > 0
              ? Math.max(...targetIssues.map((i) => i.rank ?? 0))
              : -1;
          issue.rank = maxRank >= 0 ? maxRank + 1 : 1;
        } else {
          // Insert at the target position using floating-point rank
          const beforeIssue = finalIndex > 0 ? targetIssues[finalIndex - 1] : null;
          const afterIssue = targetIssues[finalIndex] ?? null;
          const beforeRank = beforeIssue?.rank ?? -1;
          const afterRank = afterIssue?.rank ?? (beforeRank >= 0 ? beforeRank + 1 : 1);
          issue.rank = (beforeRank + afterRank) / 2;
        }
        // Update column assignment based on target column type
        if (isCustomColumn) {
          // Moving to a custom column — set customColumnId, clear status mapping
          issue.customColumnId = colId;
        } else {
          // Moving to a status column — set status, clear customColumnId
          issue.status = newStatus ?? issue.status;
          issue.customColumnId = null;
          trackHistory(issue, "status", oldStatus, newStatus ?? issue.status);
        }
        saveState();
        renderBoard();
        updateCounts();
        // Build undo toast message
        const columnName = colDef ? colDef.name : newStatus;
        addActivity("ArrowRight", "Card moved");
        showUndoToast(`Moved to ${columnName}`, () => {
          // Undo: restore previous column assignment.
          // JIRITO-122 (race): SSE re-syncs (src/sse-client.ts) replace
          // `_issues` with a fresh array of brand-new Issue objects on
          // every ticket.updated event. The `issue` reference this
          // closure captured is stale (no longer in _issues). Re-resolve
          // by id from the current _issues — otherwise mutating `issue`
          // here silently no-ops (mutating a detached object) and the
          // next saveState() persists the server's value, leaving the
          // card in the moved-to column.
          const live = getIssues().find((x) => _matchesId(x, id));
          if (isCustomColumn) {
            if (live) live.customColumnId = oldCustomColumnId;
          } else {
            if (live) {
              live.status = oldStatus;
              live.customColumnId = oldCustomColumnId;
            }
          }
          saveState();
          renderBoard();
          updateCounts();
          removeUndoToast();
          showToast("Move undone", "success");
        });
      }
      // Cleanup
      draggedSource = null;
      draggedTarget = null;
    });
    // Cleanup on drag end
    col.addEventListener("dragend", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".issue-card");
      if (card) card.classList.remove("dragging");
      removeDropIndicators();
      col.classList.remove("drag-over");
      draggedId = null;
      draggedCard = null;
      draggedSource = null;
      draggedTarget = null;
    });
  });
}
// ===== Bulk Actions =====
export function updateBulkBar(): void {
  const bar = document.getElementById("bulk-bar");
  if (!bar) return;
  const sel = getSelectedIds();
  if (sel.size === 0) {
    (bar as HTMLElement).style.display = "none";
    return;
  }
  (bar as HTMLElement).style.display = "flex";
  const countEl = document.getElementById("bulk-count");
  if (countEl) countEl.textContent = `${sel.size} selected`;
}
export function handleBulkStatusChange(e: Event): void {
  const status = (e.target as HTMLSelectElement).value;
  if (!status) return;
  const movedIssues: Array<{ id: Issue["id"]; oldStatus: string }> = [];
  getIssues().forEach((i) => {
    if (isSelectedIssue(i.id)) {
      trackHistory(i, "status", i.status, status);
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
  addActivity("ArrowRight", "Bulk move");
  showUndoToast(`${movedIssues.length} issues moved`, () => {
    movedIssues.forEach((m) => {
      const issue = getIssues().find((i) => _matchesId(i, m.id));
      if (issue) {
        issue.status = m.oldStatus;
        trackHistory(issue, "status", status, m.oldStatus);
      }
    });
    saveState();
    renderBoard();
    updateCounts();
    removeUndoToast();
    showToast("Status restored", "success");
  });
}
export function handleBulkDelete(): void {
  if (!confirm(`Delete ${getSelectedIds().size} issues?`)) return;
  const titles: string[] = [];
  const deletedIssues: Issue[] = [];
  setIssues(
    getIssues().filter((i) => {
      if (isSelectedIssue(i.id)) {
        titles.push(i.title);
        deletedIssues.push(i);
        moveToTrash(i);
        delete getComments()[i.id];
        return false;
      }
      return true;
    })
  );
  // Clean up bulk selection
  getSelectedIds().clear();
  saveState();
  addActivity(`Trash`, `Deleted ${titles.length} issues`);
  renderBoard();
  updateCounts();
  updateBulkBar();
  showToast(`${titles.length} issues moved to trash`, "success");
  // Wire up undo
  showUndoToast(`${titles.length} issues deleted`, () => {
    deletedIssues.forEach((i) => getIssues().push(i));
    saveState();
    renderBoard();
    updateCounts();
    removeUndoToast();
    showToast("Issues restored", "success");
  });
}
export function handleBulkClear(): void {
  getSelectedIds().clear();
  document.querySelectorAll<HTMLInputElement>(".issue-checkbox").forEach((cb) => {
    cb.checked = false;
  });
  updateBulkBar();
}
// ===== Filter =====
/**
 * Returns the current set of active filter values from the header bar.
 */
export function getFilterValues(): {
  search: string;
  typeFilter: string;
  priorityFilter: string;
  assigneeFilter: string;
  sprintFilter: string;
} {
  return {
    search:
      (document.getElementById("search-input") as HTMLInputElement | null)?.value.toLowerCase() || "",
    typeFilter:
      (document.getElementById("filter-type") as HTMLSelectElement | null)?.value || "all",
    priorityFilter:
      (document.getElementById("filter-priority") as HTMLSelectElement | null)?.value || "all",
    assigneeFilter:
      (document.getElementById("filter-assignee") as HTMLSelectElement | null)?.value || "all",
    sprintFilter:
      (document.getElementById("sprint-filter") as HTMLSelectElement | null)?.value || "all",
  };
}
/**
 * Applies header-bar filters (search, type, priority, assignee, sprint) to
 * a given issue list. Used by board, calendar, and dashboard views so all
 * three respect the same filter controls consistently.
 */
export function filterIssues(issues: Issue[]): Issue[] {
  const { search, typeFilter, priorityFilter, assigneeFilter, sprintFilter } =
    getFilterValues();
  return issues.filter((i) => {
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
}
export function applyFilters(): void {
  const search =
    (document.getElementById("search-input") as HTMLInputElement | null)?.value.toLowerCase() || "";
  const typeFilter =
    (document.getElementById("filter-type") as HTMLSelectElement | null)?.value || "all";
  const priorityFilter =
    (document.getElementById("filter-priority") as HTMLSelectElement | null)?.value || "all";
  const assigneeFilter =
    (document.getElementById("filter-assignee") as HTMLSelectElement | null)?.value || "all";
  const sprintFilter =
    (document.getElementById("sprint-filter") as HTMLSelectElement | null)?.value || "all";
  const columns = getEffectiveColumns();
  columns.forEach((colDef) => {
    const colBody = document.querySelector<HTMLElement>(
      `.column-body[data-col-id="${colDef.id}"]`
    );
    if (!colBody) return;
    colBody.innerHTML = "";
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
      if (colDef.status && i.status !== colDef.status) return false;
      return true;
    });
    // Sort by rank (custom ordering)
    filtered.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    // Custom columns (no status) filter by customColumnId instead of
    // status. Without this, a custom column would show every issue in
    // the project because the `colDef.status && i.status !== ...` check
    // is bypassed when colDef.status is null. (B5 regression — this
    // broke once SSE-driven board refreshes ran renderBoard() against
    // a state where customColumnId had been set on two issues; the
    // status-based filter then admitted all 6 issues to the custom
    // column because none of them had the column's null status.)
    if (!colDef.status) {
      const customFiltered = getIssues().filter(
        (i) => i.customColumnId === colDef.id,
      );
      // Render only customColumnId-matched issues into this column body.
      // Re-using the `filtered` variable below would be misleading since
      // the above status/type/etc filters don't apply to custom columns.
      colBody.innerHTML = "";
      customFiltered.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      customFiltered.forEach((issue) =>
        colBody.appendChild(createCard(issue)),
      );
      return;
    }
    if (
      filtered.length === 0 &&
      (search || typeFilter !== "all" || priorityFilter !== "all")
    ) {
      const noResults = document.createElement("div");
      noResults.className = "no-results";
      noResults.textContent = "No matching issues";
      colBody.appendChild(noResults);
    }
    filtered.forEach((issue) => colBody.appendChild(createCard(issue)));
  });
  updateCounts();
  // Also update list view when filters change
  if (getCurrentView() === "list") {
    renderListView();
  }
  // Re-render calendar and dashboard views when filters change so they
  // immediately reflect the new scope. Deferred with setTimeout(0) to avoid
  // a circular import: render.ts imports filterIssues from events.ts, so we
  // cannot import renderCalendarView/renderDashboardView here directly.
  if (getCurrentView() === "calendar") {
    setTimeout(() => {
      import("./render.js").then((m) => m.renderCalendarView());
    });
  }
  if (getCurrentView() === "dashboard") {
    setTimeout(() => {
      import("./render.js").then((m) => m.renderDashboardView());
    });
  }
}
// ===== Toast Notifications =====
export function showToast(message: string, type: "info" | "success" | "error" = "info"): void {
  // Remove existing toast
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;
    background: ${type === "success" ? "var(--success)" : type === "error" ? "var(--danger)" : "var(--primary)"};
    color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 200;
    animation: toastIn 0.3s ease;
  `;
  toast.setAttribute("role", "alert");
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastOut 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
// ===== Undo Toast =====
let currentUndoCallback: (() => void) | null = null;
/**
 * Getter for the module-scope undo callback. The classic-script world
 * exposed `currentUndoCallback` as a global `let`; in the module world
 * we expose a typed accessor instead (added in phase 5 for the
 * keyboard-shortcut handler in main-shortcuts.ts).
 */
export function getCurrentUndoCallback(): (() => void) | null {
  return currentUndoCallback;
}
let undoToast: HTMLElement | null = null;
// Event delegation on document.body for undo button to avoid stale listeners
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "undo-btn" && currentUndoCallback) {
      currentUndoCallback();
      removeUndoToast();
    }
  });
}
export function showUndoToast(message: string, onUndo: () => void): void {
  if (undoToast) undoToast.remove();
  currentUndoCallback = onUndo;
  const toast = document.createElement("div");
  toast.className = "toast toast-undo";
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; border-radius: 8px; font-size: 14px;
    background: var(--bg-card); color: var(--text); box-shadow: 0 4px 12px var(--shadow);
    z-index: 200; display: flex; align-items: center; gap: 12px;
  `;
  toast.setAttribute("role", "alert");
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
export function removeUndoToast(): void {
  if (undoToast) {
    undoToast.remove();
    undoToast = null;
  }
  currentUndoCallback = null;
}
// ===== Sprint List Rendering =====
export function renderSprintList(): void {
  const container = document.getElementById("sprint-list");
  if (!container) return;
  const sprints = getSprints();
  const entries = Object.values(sprints).sort(
    (a, b) => new Date(a.startDate ?? "").getTime() - new Date(b.startDate ?? "").getTime()
  );
  if (entries.length === 0) {
    container.innerHTML =
      '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No sprints yet. Create one above.</p>';
    return;
  }
  container.innerHTML = entries
    .map((s) => {
      const active = getActiveSprint()?.id === s.id;
      const now = new Date();
      const start = new Date(s.startDate ?? "");
      const end = new Date(s.endDate ?? "");
      const isPast = now > end;
      const isFuture = now < start;
      const statusClass = active ? "active" : isPast ? "past" : isFuture ? "future" : "";
      const statusLabel = active ? "● Active" : isPast ? "Past" : isFuture ? "Future" : "";
      const sprintIssues = getIssues().filter((i) => i.sprint === s.id);
      const totalSP = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const doneSP = sprintIssues
        .filter((i) => i.status === "done")
        .reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      return `<div class="sprint-list-item ${statusClass}">
      <div class="sprint-list-info">
        <strong>${escapeHtml(s.name)}</strong>
        <span class="sprint-list-dates">${formatDate(s.startDate)} → ${formatDate(s.endDate)}</span>
        <span class="sprint-list-status">${statusLabel}</span>
        <span class="sprint-list-points">${doneSP}/${totalSP} points</span>
      </div>
      <div class="sprint-list-actions">
        ${!s.archived ? `<button class="btn btn-secondary btn-sm sprint-activate-btn" data-id="${s.id}">${active ? "Active" : "Activate"}</button>` : ""}
        <button class="btn btn-danger btn-sm sprint-archive-btn" data-id="${s.id}">${s.archived ? "Restore" : "Archive"}</button>
        <button class="btn btn-danger btn-sm sprint-delete-btn" data-id="${s.id}">Delete</button>
      </div>
    </div>`;
    })
    .join("");
  // Activate buttons
  container.querySelectorAll<HTMLButtonElement>(".sprint-activate-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      // Deactivate all others
      const sprintsMap = getSprints();
      Object.keys(sprintsMap).forEach((k) => {
        if (sprintsMap[k].id !== id) sprintsMap[k].active = false;
      });
      sprintsMap[id].active = true;
      void saveState();
      renderSprintList();
      // Update sprint bar
      const newActive = getActiveSprint();
      if (newActive) {
        const sprintBar = document.getElementById("sprint-bar");
        if (sprintBar) {
          (sprintBar as HTMLElement).style.display = "block";
          const nameEl = document.getElementById("sprint-bar-name");
          if (nameEl) nameEl.textContent = newActive.name;
          updateSprintProgressBar(newActive);
        }
      }
      showToast("Sprint activated", "success");
    });
  });
  // Archive/restore buttons
  container.querySelectorAll<HTMLButtonElement>(".sprint-archive-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      const sprintsMap = getSprints();
      const archived = !sprintsMap[id].archived;
      sprintsMap[id].archived = archived;
      void saveState();
      renderSprintList();
      populateSprintFilter();
      populateSprintSelect();
      showToast(archived ? "Sprint archived" : "Sprint restored", "success");
    });
  });
  // Delete buttons
  container.querySelectorAll<HTMLButtonElement>(".sprint-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm("Delete this sprint? Issues will be unassigned from it.")) return;
      deleteSprint(id);
      renderSprintList();
      populateSprintFilter();
      populateSprintSelect();
      updateSprintBar();
      showToast("Sprint deleted", "success");
    });
  });
}
