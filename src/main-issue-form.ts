/**
 * src/main-issue-form.ts — Create-issue form submission + duplicate detection.
 *
 * Conversion notes from src/main-issue-form.js:
 *   - 1:1 translation. All state helpers come from `state.ts` (attached),
 *     except `openModal` / `closeModal` from `main-modals.ts`.
 *   - `findDuplicateIssues` is provided by `state.ts`; the live-warning
 *     DOM element is created inline rather than via a styled component
 *     (preserves legacy behaviour).
 *   - Issue objects are tagged with `projectId: getCurrentProject()` so
 *     the board can filter per-project (required after the SQLite move;
 *     in server mode the issues are global).
 */

import type { Issue } from "./types";
import { attach } from "./_attach.js";

export function initIssueForm(): void {
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
    modalOverlay.addEventListener("click", (e: Event) => {
      if (!(e.target as HTMLElement).closest(".modal")) closeModal();
    });
  }

  const issueForm = document.getElementById("issue-form") as HTMLFormElement | null;
  if (issueForm) {
    issueForm.addEventListener("submit", (e: Event) => {
      e.preventDefault();
      const title = (document.getElementById("issue-title") as HTMLInputElement | null)?.value.trim() ?? "";
      // Check for duplicates
      const duplicates = findDuplicateIssues(title);
      if (duplicates.length > 0) {
        const dupKeys = duplicates.map((d) => generateIssueKey(getProjectKey(), d.id)).join(", ");
        if (!confirm(`Similar issue(s) found: ${dupKeys}. Create anyway?`)) {
          return;
        }
      }
      setIssueCounter(getIssueCounter() + 1);
      const newIssue: Issue = {
        id: getIssueCounter(),
        title: title,
        desc: (document.getElementById("issue-desc") as HTMLTextAreaElement | null)?.value.trim() ?? "",
        type: ((document.getElementById("issue-type") as HTMLSelectElement | null)?.value ?? "task") as Issue["type"],
        priority: ((document.getElementById("issue-priority") as HTMLSelectElement | null)?.value ??
          "medium") as Issue["priority"],
        assignee: (document.getElementById("issue-assignee") as HTMLInputElement | null)?.value.trim() ?? "",
        status: "todo",
        // Tag the issue with the current project so the board can
        // filter per-project. This is required after the SQLite
        // migration (the legacy localStorage mode tracked per-project
        // issues separately; in server mode the issues are global and
        // the board filters by projectId).
        projectId: getCurrentProject(),
        dueDate: (document.getElementById("issue-due-date") as HTMLInputElement | null)?.value || null,
        labels: [],
        storyPoints: (() => {
          const raw = (document.getElementById("issue-story-points") as HTMLInputElement | null)?.value;
          return raw ? parseInt(raw, 10) : null;
        })(),
        sprint: (document.getElementById("issue-sprint") as HTMLSelectElement | null)?.value || null,
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
  const issueTitleInput = document.getElementById("issue-title") as HTMLInputElement | null;
  if (issueTitleInput) {
    issueTitleInput.addEventListener("input", () => {
      const title = issueTitleInput.value.trim();
      const existingWarning = document.getElementById("duplicate-warning");
      if (existingWarning) existingWarning.remove();
      if (title.length < 3) return;
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

declare function openModal(status?: string): void;
declare function closeModal(): void;
declare function findDuplicateIssues(title: string): Issue[];
declare function generateIssueKey(projectKey: string, id: Issue["id"]): string;
declare function getProjectKey(): string;
declare function setIssueCounter(v: number): void;
declare function getIssueCounter(): number;
declare function getCurrentProject(): string;
declare function getIssues(): Issue[];
declare function getComments(): Record<string, unknown[]>;
declare function saveStateImmediate(): Promise<void>;
declare function renderBoard(): void;
declare function addActivity(icon: string, text: string): void;
declare function showUndoToast(message: string, onUndo: () => void): void;
declare function removeUndoToast(): void;
declare function showToast(message: string, kind?: "info" | "success" | "error"): void;
declare function updateCounts(): void;
declare function renderTrash(): void;

attach({ initIssueForm });
