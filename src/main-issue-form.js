/**
 * src/main-issue-form.ts — Create-issue form submission + duplicate detection.
 *
 * Conversion notes from src/main-issue-form.js:
 *   - 1:1 translation. All state helpers come from `./state.ts`;
 *     `openModal` / `closeModal` are imported from `./main-modals.ts`.
 *   - `findDuplicateIssues` is provided by `state.ts`; the live-warning
 *     DOM element is created inline rather than via a styled component
 *     (preserves legacy behaviour).
 *   - Issue objects are tagged with `projectId: getCurrentProject()` so
 *     the board can filter per-project (required after the SQLite move;
 *     in server mode the issues are global).
 */
import { addActivity, findDuplicateIssues, getComments, getCurrentProject, getIssueCounter, getIssues, saveStateImmediate, setIssueCounter, } from "./state.js";
import { renderBoard, updateCounts } from "./render.js";
import { removeUndoToast, showToast, showUndoToast } from "./events.js";
import { generateIssueKey, getProjectKey } from "./utils.js";
import { closeModal, openModal } from "./main-modals.js";
import { renderTrash } from "./main-trash.js";
export function initIssueForm() {
    const addIssueBtn = document.getElementById("add-issue-btn");
    if (addIssueBtn) {
        addIssueBtn.addEventListener("click", () => openModal());
    }
    const modalClose = document.getElementById("modal-close");
    if (modalClose) {
        modalClose.addEventListener("click", () => closeModal());
    }
    const modalCancel = document.getElementById("modal-cancel");
    if (modalCancel) {
        modalCancel.addEventListener("click", () => closeModal());
    }
    const modalOverlay = document.getElementById("modal-overlay");
    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (!e.target.closest(".modal"))
                closeModal();
        });
    }
    const issueForm = document.getElementById("issue-form");
    if (issueForm) {
        issueForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const title = document.getElementById("issue-title")?.value.trim() ?? "";
            // Check for duplicates
            const duplicates = findDuplicateIssues(title);
            if (duplicates.length > 0) {
                const dupKeys = duplicates.map((d) => generateIssueKey(getProjectKey(), d.id)).join(", ");
                if (!confirm(`Similar issue(s) found: ${dupKeys}. Create anyway?`)) {
                    return;
                }
            }
            setIssueCounter(getIssueCounter() + 1);
            const newIssue = {
                id: getIssueCounter(),
                title: title,
                desc: document.getElementById("issue-desc")?.value.trim() ?? "",
                type: (document.getElementById("issue-type")?.value ?? "task"),
                priority: (document.getElementById("issue-priority")?.value ??
                    "medium"),
                assignee: document.getElementById("issue-assignee")?.value.trim() ?? "",
                status: "todo",
                // Tag the issue with the current project so the board can
                // filter per-project. This is required after the SQLite
                // migration (the legacy localStorage mode tracked per-project
                // issues separately; in server mode the issues are global and
                // the board filters by projectId).
                projectId: getCurrentProject(),
                dueDate: document.getElementById("issue-due-date")?.value || null,
                labels: [],
                storyPoints: (() => {
                    const raw = document.getElementById("issue-story-points")?.value;
                    return raw ? parseInt(raw, 10) : null;
                })(),
                sprint: document.getElementById("issue-sprint")?.value || null,
                rank: getIssues().length,
                history: [],
            };
            getIssues().push(newIssue);
            saveStateImmediate();
            renderBoard();
            closeModal();
            addActivity("PlusCircle", `Created <strong>${generateIssueKey(getProjectKey(), newIssue.id)}</strong>`);
            showUndoToast(`Created ${generateIssueKey(getProjectKey(), newIssue.id)}`, () => {
                const idx = getIssues().findIndex((i) => i.id === newIssue.id);
                if (idx !== -1) {
                    getIssues().splice(idx, 1);
                    delete getComments()[newIssue.id];
                    saveStateImmediate();
                    renderBoard();
                    updateCounts();
                    renderTrash();
                }
                removeUndoToast();
                showToast("Issue deleted", "success");
            });
        });
    }
    // Live duplicate detection on title input
    const issueTitleInput = document.getElementById("issue-title");
    if (issueTitleInput) {
        issueTitleInput.addEventListener("input", () => {
            const title = issueTitleInput.value.trim();
            const existingWarning = document.getElementById("duplicate-warning");
            if (existingWarning)
                existingWarning.remove();
            if (title.length < 3)
                return;
            const duplicates = findDuplicateIssues(title);
            if (duplicates.length > 0) {
                const dupKeys = duplicates.map((d) => generateIssueKey(getProjectKey(), d.id)).join(", ");
                const warning = document.createElement("div");
                warning.id = "duplicate-warning";
                warning.style.cssText =
                    "color:var(--warning);font-size:12px;margin-top:4px;padding:6px 8px;background:var(--warning-bg);border-radius:4px;";
                warning.textContent = `⚠ Similar issue(s): ${dupKeys}`;
                issueTitleInput.parentElement?.appendChild(warning);
            }
        });
    }
}
//# sourceMappingURL=main-issue-form.js.map