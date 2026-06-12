/**
 * src/data.ts — Bulk export / import and project lifecycle helpers.
 *
 * Conversion notes (from src/data.js):
 *   - `LJ_CONSTANTS.X` references are replaced with `CONSTANTS.X`.
 *   - `importData`'s validation block was a chain of `throw new Error(...)`
 *     guarded by `if (issue.X != null)`. We keep the same shape; the only
 *     typed change is the `as Issue[]` cast on the final assignment so
 *     `setIssues` accepts the validated list.
 *   - `importData` mutates several module-scope vars in `state.js`
 *     (`_comments`, `_activityLog`, `_trash`, `_sprints`) directly. We
 *     keep that style for now; the end-state refactor (plan §10.1) will
 *     route these through the typed setters.
 */

import type { Issue, Project, SavedFilter, TrashEntry } from "./types";
import { CONSTANTS } from "./constants.js";
import { attach } from "./_attach.js";

const { MAX_TITLE_LENGTH, MAX_PROJECT_KEY_LENGTH, VALID_STATUSES, VALID_ISSUE_TYPES, VALID_PRIORITIES } = CONSTANTS;

// ===== Data Operations =====

export function exportData(): void {
  const data = {
    issues: getIssues(),
    comments: getComments(),
    projects: getProjects(),
    currentProject: getCurrentProject(),
    savedFilters: getSavedFilters(),
    activityLog: getActivityLog().map((a) => ({ ...a, time: (a.time instanceof Date ? a.time : new Date(a.time as unknown as string)).toISOString() })),
    issueCounter: getIssueCounter(),
    trash: getTrash().map((t) => ({ ...t, date: (t.date instanceof Date ? t.date : new Date(t.date as unknown as string)).toISOString() })),
    sprints: getSprints(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jirito-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  addActivity("Download", "Exported board data");
}

export function importData(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const raw = e.target?.result;
      if (typeof raw !== "string") throw new Error("Could not read file");
      const data = JSON.parse(raw) as {
        issues?: Issue[];
        comments?: Record<string, unknown>;
        projects?: Record<string, Project>;
        currentProject?: string;
        savedFilters?: SavedFilter[];
        activityLog?: Array<{ icon: string; text: string; time: string }>;
        issueCounter?: number;
        trash?: TrashEntry[];
        sprints?: Record<string, unknown>;
      };
      if (!data.issues || !data.comments) throw new Error("Invalid format");
      // Task 1.2: Validate projects structure
      if (typeof data.projects !== "object" || data.projects === null || Array.isArray(data.projects)) {
        throw new Error("Invalid projects format");
      }
      // Validate each project has required fields
      for (const [key, proj] of Object.entries(data.projects)) {
        if (typeof proj !== "object" || proj === null) {
          throw new Error(`Invalid project "${key}"`);
        }
        if (typeof proj.name !== "string" || proj.name.trim() === "") {
          throw new Error(`Project "${key}" must have a non-empty name`);
        }
        if (typeof proj.key !== "string" || proj.key.trim() === "") {
          throw new Error(`Project "${key}" must have a non-empty key`);
        }
      }
      // Task 1.3: Validate comments structure
      if (typeof data.comments !== "object" || data.comments === null || Array.isArray(data.comments)) {
        throw new Error("Invalid comments format");
      }
      // Validate required fields
      for (const issue of data.issues) {
        if (issue.id == null || issue.title == null || issue.status == null) {
          throw new Error("Imported issues must have id, title, and status fields");
        }
        // Validate title length
        if (typeof issue.title === "string" && issue.title.length > MAX_TITLE_LENGTH) {
          throw new Error(`Issue #${issue.id}: title exceeds ${MAX_TITLE_LENGTH} characters`);
        }
        // Validate status is allowed
        if (!VALID_STATUSES.includes(issue.status as (typeof VALID_STATUSES)[number])) {
          throw new Error(
            `Issue #${issue.id}: invalid status "${issue.status}" (allowed: ${VALID_STATUSES.join(", ")})`,
          );
        }
        // Validate type if present
        if (issue.type != null && !VALID_ISSUE_TYPES.includes(issue.type as (typeof VALID_ISSUE_TYPES)[number])) {
          throw new Error(
            `Issue #${issue.id}: invalid type "${issue.type}" (allowed: ${VALID_ISSUE_TYPES.join(", ")})`,
          );
        }
        // Validate priority if present
        if (issue.priority != null && !VALID_PRIORITIES.includes(issue.priority as (typeof VALID_PRIORITIES)[number])) {
          throw new Error(
            `Issue #${issue.id}: invalid priority "${issue.priority}" (allowed: ${VALID_PRIORITIES.join(", ")})`,
          );
        }
        // Validate id is positive integer
        if (typeof issue.id !== "number" || issue.id < 1 || !Number.isInteger(issue.id)) {
          throw new Error(`Issue #${issue.id}: id must be a positive integer`);
        }
        // Sanitize labels: ensure array of strings
        if (issue.labels != null) {
          if (!Array.isArray(issue.labels)) {
            issue.labels = [issue.labels as unknown as string];
          }
          issue.labels = (issue.labels as unknown as string[]).filter(
            (l) => typeof l === "string" && l.trim(),
          );
        }
        // Sanitize assignee
        if (issue.assignee != null && typeof issue.assignee !== "string") {
          issue.assignee = String(issue.assignee);
        }
        // Sanitize story points
        if (issue.storyPoints != null) {
          const sp = parseInt(String(issue.storyPoints), 10);
          issue.storyPoints = Number.isInteger(sp) && sp >= 0 && sp <= 100 ? sp : null;
        }
      }
      setIssues(data.issues);
      _comments = data.comments;
      setProjects(data.projects);
      setCurrentProject(data.currentProject || "default");
      setSavedFilters(data.savedFilters || []);
      _activityLog = (data.activityLog || []).map((a) => ({ ...a, time: new Date(a.time) }));
      // Prevent ID collision: ensure issueCounter is higher than any imported ID
      const maxId = Math.max(...getIssues().map((i) => Number(i.id) || 0), 0);
      setIssueCounter(Math.max(data.issueCounter || 106, maxId + 1));
      if (data.trash) {
        _trash = data.trash.map((t) => ({ ...t, date: new Date(t.date as unknown as string) }));
        purgeTrash();
      }
      if (data.sprints) {
        _sprints = data.sprints;
      }
      // State synced via setters above
      selectedIds = getSelectedIds();
      trash = getTrash();
      saveState();
      renderBoard();
      renderSidebar();
      populateAssigneeFilter();
      updateCounts();
      addActivity("Upload", "Imported board data");
      showToast("Import successful!", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast("Import failed: " + message, "error");
    }
  };
  reader.readAsText(file);
}

export function createProject(name: string, key: string): string | null {
  // Sanitize project key: only allow alphanumeric, dash, underscore
  const sanitizedKey = key
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toUpperCase()
    .slice(0, MAX_PROJECT_KEY_LENGTH);
  if (!sanitizedKey) {
    showToast("Project key must contain only letters, numbers, dashes, and underscores.", "error");
    return null;
  }
  const icons = ["🚀", "🎯", "⚡", "🔥", "💡", "🌟", "🎨", "🔧"];
  const icon = icons[Math.floor(Math.random() * icons.length)];
  getProjects()[sanitizedKey] = { id: sanitizedKey, name, icon, key: sanitizedKey, issues: [] };
  saveState();
  switchProject(sanitizedKey);
  addActivity("Sparkles", `<strong>${escapeHtml(name)}</strong> project created`);
  return sanitizedKey;
}

export function deleteProject(key: string): void {
  if (Object.keys(getProjects()).length <= 1) {
    showToast("You must have at least one project.", "error");
    return;
  }
  if (!confirm(`Delete project "${getProjects()[key].name}" and all its issues?`)) return;
  // Move project issues to trash before deleting
  const projectIssues = (getProjects()[key].issues || []).filter((i): i is Issue => Boolean(i));
  if (projectIssues.length > 0) {
    const entry = { issues: projectIssues, date: new Date() } as TrashEntry;
    getTrash().unshift(entry);
  }
  delete getProjects()[key];
  const remaining = Object.keys(getProjects())[0];
  saveState();
  switchProject(remaining);
}

// ===== Cross-module references =====
//
// The functions below are supplied at runtime by other classic-script
// files. We declare their signatures so the .ts compiler can verify the
// call sites. Phase 5 will convert these too and the `declare` blocks
// will move into `./_attach`-shaped `import` statements.

// State (from src/state.js)
declare function getIssues(): Issue[];
declare function getComments(): Record<string, Issue[]>;
declare function getProjects(): Record<string, Project>;
declare function getCurrentProject(): string;
declare function getSavedFilters(): SavedFilter[];
declare function getActivityLog(): Array<{ icon: string; text: string; time: Date | string }>;
declare function getIssueCounter(): number;
declare function getTrash(): TrashEntry[];
declare function getSprints(): Record<string, unknown>;
declare function setIssues(v: Issue[]): void;
declare function setProjects(v: Record<string, Project>): void;
declare function setCurrentProject(v: string): void;
declare function setSavedFilters(v: SavedFilter[]): void;
declare function setIssueCounter(v: number): void;
declare function saveState(): Promise<void>;
declare function purgeTrash(): void;
declare function switchProject(key: string): void;
declare function populateAssigneeFilter(): void;

// Render (from src/render.js)
declare function renderBoard(): void;
declare function renderSidebar(): void;
declare function updateCounts(): void;

// Utils (from src/utils.js)
declare function escapeHtml(str: unknown): string;

declare function getSelectedIds(): Set<string | number>;

// Module-scope state vars in src/state.js that the original `importData`
// mutated directly. We keep the same shape; these will be removed in
// the post-migration refactor when `setComments`, `setActivityLog`, etc.
// exist.
declare let _comments: Record<string, unknown>;
declare let _activityLog: Array<{ icon: string; text: string; time: Date | string }>;
declare let _trash: TrashEntry[];
declare let _sprints: Record<string, unknown>;
declare let selectedIds: Set<string | number>;
declare let trash: TrashEntry[];

// UI helpers from src/main-notifications.js / main-modals.js
declare function showToast(message: string, kind: "success" | "error" | "info"): void;
declare function addActivity(icon: string, text: string): void;

attach({
  exportData,
  importData,
  createProject,
  deleteProject,
});
