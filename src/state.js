/**
 * src/state.ts — Module-scoped state with typed getters/setters.
 *
 * Conversion notes (from src/state.js):
 *   - The `LJ_CONSTANTS.X` constants are pulled from `./constants`.
 *   - The 16 bare `let` aliases in the legacy file are gone; every
 *     external read goes through a getter.
 *   - `addActivity()` and `moveToTrash()` keep their synchronous
 *     signatures; the persistence write (`saveState()`) is debounced.
 *   - `loadState()` is the only `async` entry point and is what
 *     `main.js` awaits before the first render.
 */
import { CONSTANTS } from "./constants.js";
import { storage } from "./storage.js";
import { renderActivity, renderBoard, updateCounts } from "./render.js";
const { ACTIVITY_LOG_MAX, TRASH_RETENTION_MS, ISSUE_COUNTER_START, DUPLICATE_WORD_OVERLAP, SAVE_STATE_DEBOUNCE_MS, } = CONSTANTS;
// Internal state storage
let _issues = [];
let _issueCounter = ISSUE_COUNTER_START;
let _currentDetailIssue = null;
let _comments = {};
let _currentProject = "default";
let _currentView = "board";
let _projects = {};
let _savedFilters = [];
let _activityLog = [];
let _selectedIds = new Set();
let _trash = [];
let _sprints = {};
let _customColumns = [];
let _markdownCache = {};
// Per-column overrides for the 4 default columns (name / color only).
// The status field is fixed and never overridable.
let _defaultColumnOverrides = {};
/**
 * Coerce both sides to string for ID comparison. After the SQLite
 * migration, issue ids are stored as numbers but the DOM (data-id) and
 * URL params are always strings, so a strict === would always fail.
 */
function _matchesId(issue, id) {
    if (issue == null || id == null)
        return false;
    return String(issue.id) === String(id);
}
/**
 * Find an issue by id, tolerating string/number id mismatches between
 * DOM data-* attributes and SQLite-stored numeric ids. Returns the
 * issue or `undefined` if not found.
 *
 * Added in phase 5 for the column-menu undo path; replaces inline
 * `_matchesId` checks in consumer modules.
 */
export function pickIssue(id) {
    return _issues.find((i) => _matchesId(i, id));
}
// ===== Getter / Setter Accessors =====
export function getIssues() {
    return _issues;
}
export function setIssues(v) {
    _issues = v;
}
export function getIssueCounter() {
    return _issueCounter;
}
export function setIssueCounter(v) {
    _issueCounter = v;
}
export function getCurrentDetailIssue() {
    return _currentDetailIssue;
}
export function setCurrentDetailIssue(v) {
    _currentDetailIssue = v;
}
export function getComments() {
    return _comments;
}
export function setComments(v) {
    _comments = v;
}
export function getCurrentProject() {
    return _currentProject;
}
export function setCurrentProject(v) {
    _currentProject = v;
}
export function getCurrentView() {
    return _currentView;
}
export function setCurrentView(v) {
    _currentView = v;
}
export function getProjects() {
    return _projects;
}
export function setProjects(v) {
    _projects = v;
}
export function getSavedFilters() {
    return _savedFilters;
}
export function setSavedFilters(v) {
    _savedFilters = v;
}
export function getActivityLog() {
    return _activityLog;
}
export function setActivityLog(v) {
    _activityLog = v;
}
export function getSelectedIds() {
    return _selectedIds;
}
/**
 * Loose check whether a given issue id is in the selected set.
 * After the SQLite migration, stored IDs may be strings (from dataset.id)
 * or numbers (from issue.id) depending on the path that added them.
 * Compare both forms.
 */
export function isSelectedIssue(issueId) {
    const set = _selectedIds;
    if (set.has(issueId))
        return true;
    return set.has(String(issueId)) || set.has(Number(issueId));
}
export function getTrash() {
    return _trash;
}
export function setTrash(v) {
    _trash = v;
}
export function getSprints() {
    if (!_sprints)
        _sprints = {};
    return _sprints;
}
export function setSprints(v) {
    _sprints = v;
}
export function getCustomColumns() {
    return _customColumns;
}
export function setCustomColumns(v) {
    _customColumns = v;
}
export function getDefaultColumnOverrides() {
    return _defaultColumnOverrides;
}
export function setDefaultColumnOverrides(v) {
    _defaultColumnOverrides = v;
}
export function getMarkdownCache() {
    return _markdownCache;
}
// ===== Activity =====
export function addActivity(icon, text) {
    _activityLog.unshift({ icon, text, time: new Date() });
    if (_activityLog.length > ACTIVITY_LOG_MAX)
        _activityLog.pop();
    renderActivity();
}
// ===== State Load / Save =====
// Uses the storage abstraction layer (localStorage or server API).
let _initialized = false;
export async function loadState() {
    console.log("[loadState] called, _initialized:", _initialized);
    // Initialize storage layer (detects online/offline mode)
    if (!_initialized) {
        await storage.initStorage();
        _initialized = true;
    }
    // Load persisted data from storage layer (localStorage or server)
    const data = await storage.getStorageData();
    // Empty state — no demo data is ever seeded. Burned 2026-06-21:
    // the previous "seed sample issues on first run" path kept surfacing
    // hardcoded 101-106 tickets in the live SQLite DB every time the
    // user cleared the DB. The user wants an empty board by default.
    // See references/2026-06-21-no-demo-data.md.
    if (data && data.issues && data.issues.length > 0) {
        _issues = data.issues.map((i) => ({ ...i, desc: i.desc || i.description || "" }));
        _issueCounter = Math.max(..._issues.map((i) => Number(i.id) || 0), ISSUE_COUNTER_START);
        console.log("[loadState] Loaded", _issues.length, "issues from storage, first dueDate:", _issues[0]?.dueDate);
    }
    else {
        // Empty state — never seed sample/demo issues. Burned 2026-06-21:
        // even the "only on a genuine first run" path was enough to surface
        // hardcoded 101-106 tickets in the live SQLite DB every time the user
        // cleared the DB. The user wants an empty board by default; they
        // create their own tickets. See references/2026-06-21-no-demo-data.md.
        _issues = [];
        _issueCounter = Math.max(ISSUE_COUNTER_START, _issueCounter ?? 0);
        console.log("[loadState] Empty state, no issues to load");
    }
    // Restore projects (storage layer uses object-per-key format)
    if (data && data.projects) {
        _projects = data.projects;
    }
    // No auto-created "Project Alpha" / "Default Project" / sample tickets.
    // The user starts with an empty board. If they want a project, they
    // create one through the UI. See references/2026-06-21-no-demo-data.md.
    // Validate currentProject exists in projects before restoring.
    // If no projects exist yet (clean board), leave _currentProject empty
    // so the UI can show a "create your first project" empty state. The
    // previous `_currentProject = "default"` fallback assumed the demo
    // project would always be there — that assumption is gone now.
    if (data && data.currentProject && _projects[data.currentProject]) {
        _currentProject = data.currentProject;
    }
    else {
        const keys = Object.keys(_projects);
        _currentProject = keys.length > 0 ? keys[0] : "";
    }
    // Restore filters, activity, trash, sprints, customColumns from storage layer
    if (data && data.filters) {
        _savedFilters = data.filters;
    }
    if (data && data.activity) {
        _activityLog = data.activity.map((a) => ({ ...a, time: new Date(a.time) }));
    }
    if (data && data.trash) {
        _trash = data.trash.map((t) => ({ ...t, date: new Date(t.date) }));
        purgeTrash();
    }
    if (data && data.sprints) {
        _sprints = data.sprints;
    }
    if (data && Array.isArray(data.customColumns) && data.customColumns.length > 0) {
        _customColumns = data.customColumns;
    }
    else if (data && data.columns && Array.isArray(data.columns) && data.columns.length > 0) {
        // Server stores as 'columns' array with different schema.
        // Translate to frontend format: { id, name, color, status, order }.
        // The server column has a JSON-encoded `query` field with extra
        // metadata; we only surface the bits the UI cares about.
        _customColumns = data.columns.map((col, idx) => {
            let query = {};
            if (typeof col.query === "string") {
                try {
                    query = JSON.parse(col.query);
                }
                catch {
                    query = {};
                }
            }
            else if (col.query) {
                query = col.query;
            }
            return {
                id: col.id,
                name: col.name,
                color: query.color || "#9E9E9E",
                status: query.status || null,
                order: col.sortOrder ?? idx,
            };
        });
    }
    // Restore default column overrides (name/color for the 4 built-in columns)
    if (data && typeof data === "object" && "_defaultColumnOverrides" in data) {
        _defaultColumnOverrides = data["_defaultColumnOverrides"];
    }
    // Restore comments keyed by issue id (JIRITO-104)
    if (data && data.comments) {
        _comments = data.comments;
    }
    // Restore current view mode (JIRITO-104)
    if (data && typeof data === "object" && "currentView" in data) {
        _currentView = data.currentView || "board";
    }
    // Sync in-memory issues with current project
    initializeData();
}
// Internal debounce timer
let _saveStateTimer = null;
// Expose a flag used by main.js's beforeunload handler to decide whether
// a debounced save is queued. The flag is true only between a saveState()
// call and the actual flush — preventing stale in-memory state from
// overwriting newer server state on page reload.
try {
    if (typeof window !== "undefined") {
        window.__jiritoHasPendingSave = function () {
            return _saveStateTimer !== null;
        };
    }
}
catch {
    /* ignore */
}
/**
 * `saveState` — debounced by default (300 ms).
 * Batches rapid successive calls into a single persistence write.
 * Call `saveStateImmediate()` when you need guaranteed persistence right away.
 */
export async function saveState() {
    if (_saveStateTimer) {
        clearTimeout(_saveStateTimer);
    }
    _saveStateTimer = setTimeout(async () => {
        await _doSaveState();
        _saveStateTimer = null;
    }, SAVE_STATE_DEBOUNCE_MS);
}
// Internal: performs the actual persistence writes (localStorage or server).
async function _doSaveState() {
    // Build the storage-layer data structure
    const customCols = getCustomColumns();
    const data = {
        issues: _issues,
        projects: { ..._projects },
        currentProject: _currentProject,
        filters: _savedFilters || [],
        activity: _activityLog.map((a) => ({ ...a, time: a.time })),
        trash: _trash.map((t) => ({ ...t, date: t.date })),
        sprints: _sprints,
        // Persist the local issue counter so the next client reload doesn't
        // regress to ISSUE_COUNTER_START and collide with existing IDs.
        issueCounter: _issueCounter,
        // Persist comments keyed by issue id (JIRITO-104)
        comments: _comments,
        // Persist current view mode (JIRITO-104)
        currentView: _currentView,
    };
    // Include columns if there are actual custom columns (not the default {} sentinel)
    if (Array.isArray(customCols) && customCols.length > 0) {
        data.columns = customCols;
    }
    // Persist default column overrides (name/color for built-in columns)
    const overrides = getDefaultColumnOverrides();
    if (Object.keys(overrides).length > 0) {
        data._defaultColumnOverrides = overrides;
    }
    // Delegate to storage layer (handles localStorage or server API)
    await storage.saveStorageData(data);
}
/**
 * Force immediate save (no debounce) — use for critical operations:
 *  - before page unload
 *  - after user-triggered export
 *  - after the last operation in a batch where undo must work
 */
export async function saveStateImmediate() {
    if (_saveStateTimer) {
        clearTimeout(_saveStateTimer);
        _saveStateTimer = null;
    }
    await _doSaveState();
}
// ===== Trash =====
export function purgeTrash() {
    const now = new Date();
    _trash = _trash.filter((t) => now.getTime() - new Date(t.date).getTime() < TRASH_RETENTION_MS);
}
export function moveToTrash(issue) {
    // The client-side trash shape is `TrashEntry` with `data` optional and
    // `issues` populated. The original `.js` pushed a plain object; we
    // cast to satisfy the strict interface.
    const entry = { issues: [issue], date: new Date() };
    _trash.unshift(entry);
    saveState();
}
export function restoreFromTrash(idx) {
    if (idx < 0 || idx >= _trash.length)
        return;
    const entry = _trash[idx];
    entry.issues.forEach((i) => {
        i.status = "todo";
        _issues.push(i);
    });
    _trash.splice(idx, 1);
    saveState();
    renderBoard();
    updateCounts();
}
// ===== Sprints =====
function saveSprints() {
    // Delegate to storage layer — handles both server and localStorage modes
    const data = {
        issues: _issues,
        projects: _projects,
        currentProject: _currentProject,
        filters: _savedFilters,
        activity: _activityLog.map((a) => ({ icon: a.icon, text: a.text, time: a.time })),
        issueCounter: _issueCounter,
        trash: _trash.map((t) => ({ issues: t.issues || [], date: t.date })),
        sprints: _sprints,
        columns: getEffectiveColumns(),
        customColumns: getCustomColumns(),
    };
    storage.saveStorageData(data).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[state] saveSprints failed:", message);
    });
}
export function createSprint(name, startDate, endDate) {
    const sprints = getSprints();
    const id = "sprint-" + Date.now();
    sprints[id] = { id, name, startDate, endDate, active: false, archived: false };
    saveSprints();
    return sprints[id];
}
export function updateSprint(id, updates) {
    const sprints = getSprints();
    if (sprints[id]) {
        Object.assign(sprints[id], updates);
        saveSprints();
    }
}
export function deleteSprint(id) {
    const sprints = getSprints();
    if (sprints[id]) {
        _issues.forEach((i) => {
            if (i.sprint === id)
                i.sprint = null;
        });
        delete sprints[id];
        saveSprints();
    }
}
export function getActiveSprint() {
    const sprints = getSprints();
    const now = new Date();
    for (const s of Object.values(sprints)) {
        if (!s.archived && s.startDate && s.endDate) {
            const start = new Date(s.startDate);
            const end = new Date(s.endDate);
            if (now >= start && now <= end)
                return s;
        }
    }
    return null;
}
export function getActiveSprintId() {
    const active = getActiveSprint();
    return active ? active.id : null;
}
// ===== Dependencies =====
export function addDependency(issueId, targetId, type) {
    // Use _matchesId to tolerate string/number ID mismatches (the DOM
    // and URL params give us strings; the server-loaded issues use numbers).
    const issue = _issues.find((i) => _matchesId(i, issueId));
    if (!issue)
        return;
    if (!issue.dependencies)
        issue.dependencies = [];
    if (!issue.dependencies.find((d) => String(d.targetId) === String(targetId) && d.type === type)) {
        issue.dependencies.push({
            targetId: String(targetId),
            type,
            created: new Date().toISOString(),
        });
    }
    // Create reverse link for "blocks" type
    if (type === "blocks") {
        const target = _issues.find((i) => _matchesId(i, targetId));
        if (target && !target.dependencies)
            target.dependencies = [];
        if (target &&
            target.dependencies &&
            !target.dependencies.find((d) => String(d.targetId) === String(issueId) && d.type === "relates-to")) {
            target.dependencies.push({
                targetId: String(issueId),
                type: "relates-to",
                created: new Date().toISOString(),
            });
        }
    }
    saveState();
}
export function removeDependency(issueId, targetId, type) {
    const issue = _issues.find((i) => _matchesId(i, issueId));
    if (!issue || !issue.dependencies)
        return;
    issue.dependencies = issue.dependencies.filter((d) => !(String(d.targetId) === String(targetId) && d.type === type));
    // Remove reverse link for "blocks" type
    if (type === "blocks") {
        const target = _issues.find((i) => _matchesId(i, targetId));
        if (target && target.dependencies) {
            const deps = target.dependencies;
            target.dependencies = deps.filter((d) => !(String(d.targetId) === String(issueId) && d.type === "relates-to"));
        }
    }
    saveState();
}
export function hasCircularDependency(issueId, targetId, visited = new Set()) {
    // Compare ids as strings so string/number mismatches don't let a
    // self-loop sneak through.
    if (String(issueId) === String(targetId))
        return true;
    if (visited.has(targetId))
        return false;
    visited.add(targetId);
    const target = _issues.find((i) => _matchesId(i, targetId));
    if (!target || !target.dependencies)
        return false;
    return target.dependencies.some((d) => hasCircularDependency(issueId, d.targetId, visited));
}
export function getDependencies(issueId) {
    const issue = _issues.find((i) => _matchesId(i, issueId));
    return issue && issue.dependencies ? issue.dependencies : [];
}
export function getDependents(issueId) {
    return _issues.filter((i) => {
        if (!i.dependencies)
            return false;
        return i.dependencies.some((d) => String(d.targetId) === String(issueId));
    });
}
// ===== Sample Data =====
//
// Removed 2026-06-21 (see references/2026-06-21-no-demo-data.md).
// The previous `sampleIssues` array was the source of the recurring
// "Project Alpha" + 6 demo tickets that kept reappearing after every
// DB clear. The user explicitly wants an empty board by default —
// they create their own projects and tickets through the UI.
// Map issue type → phosphor icon name. Exported for use by render.ts
// and events.ts (which render issue cards/lists). In classic-script
// mode this const was implicitly global; in the new module world we
// export it explicitly.
export const typeIcons = { story: "FileText", bug: "Bug", task: "CheckSquare", epic: "Mountain" };
// ===== Duplicate Detection =====
export function findDuplicateIssues(title) {
    if (!title || title.length < 3)
        return [];
    const normalized = title.toLowerCase().trim();
    return _issues.filter((i) => {
        if (!i.title)
            return false;
        const other = i.title.toLowerCase().trim();
        // Exact match
        if (normalized === other)
            return false;
        // Contains match
        if (normalized.includes(other) || other.includes(normalized))
            return true;
        // Word overlap (>= 60% of words match)
        const wordsA = normalized.split(/\s+/).filter((w) => w.length > 2);
        const wordsB = other.split(/\s+/).filter((w) => w.length > 2);
        if (wordsA.length < 2 || wordsB.length < 2)
            return false;
        const shorter = wordsA.length < wordsB.length ? wordsA : wordsB;
        const longer = wordsA.length < wordsB.length ? wordsB : wordsA;
        let matches = 0;
        shorter.forEach((w) => {
            if (longer.includes(w))
                matches++;
        });
        return matches / shorter.length >= DUPLICATE_WORD_OVERLAP;
    });
}
// ===== Custom Column Helpers =====
export function getDefaultColumns() {
    const defaults = [
        { id: "todo", name: "To Do", color: "#9E9E9E", status: "todo", order: 0 },
        { id: "inprogress", name: "In Progress", color: "#D14A2A", status: "inprogress", order: 1 },
        { id: "review", name: "In Review", color: "#D49B00", status: "review", order: 2 },
        { id: "done", name: "Done", color: "#34A853", status: "done", order: 3 },
    ];
    return defaults.map((col) => {
        const override = _defaultColumnOverrides[col.id];
        if (override) {
            return { ...col, name: override.name ?? col.name, color: override.color ?? col.color };
        }
        return col;
    });
}
export function getEffectiveColumns() {
    // Defaults come first (fixed workflow), then any custom columns in
    // their saved/insertion order. Customs are rendered after the defaults
    // without a sort — the `order` field on customs is only used by the
    // mutators below, not for display.
    return [...getDefaultColumns(), ...getCustomColumns()];
}
// All column mutators operate on the *custom* subset only. The defaults
// (To Do / In Progress / In Review / Done) are a fixed workflow and must
// never be written to the custom list — doing so would demote a default
// into a "custom" and corrupt the round-trip on next save.
export function addCustomColumn(name, color) {
    const customs = getCustomColumns();
    const id = "col-" + Date.now();
    customs.push({ id, name, color: color || "#9E9E9E", status: null, order: customs.length });
    setCustomColumns(customs);
    return id;
}
export function removeCustomColumn(id) {
    const customs = getCustomColumns();
    setCustomColumns(customs.filter((c) => c.id !== id));
}
export function updateCustomColumn(id, updates) {
    const customs = getCustomColumns();
    const col = customs.find((c) => c.id === id);
    if (col) {
        Object.assign(col, updates);
        setCustomColumns(customs);
    }
}
// Reset all default column overrides to factory defaults.
export function resetDefaultColumnOverrides() {
    _defaultColumnOverrides = {};
    saveState();
}
// Update a default column's name and/or color. Status is fixed and cannot
// be changed — defaults always map to their canonical status.
export function updateDefaultColumn(id, updates) {
    const DEFAULT_IDS = new Set(["todo", "inprogress", "review", "done"]);
    if (!DEFAULT_IDS.has(id))
        return;
    const current = _defaultColumnOverrides[id] ?? {};
    _defaultColumnOverrides[id] = {
        ...current,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.color !== undefined ? { color: updates.color } : {}),
    };
    saveState();
}
export function reorderColumns(orderMap) {
    const customs = getCustomColumns();
    customs.forEach((c) => {
        if (orderMap[c.id] !== undefined)
            c.order = orderMap[c.id];
    });
    setCustomColumns(customs);
}
// ===== Data Initialization (Task 2.2: Consolidated migration logic) =====
export function initializeData() {
    // No auto-created demo project or sample issues. The user starts with
    // an empty board; they create projects and tickets through the UI.
    // See references/2026-06-21-no-demo-data.md.
    // 1. Ensure currentProject is valid (pick first available or empty)
    if (!_projects[_currentProject]) {
        const keys = Object.keys(_projects);
        _currentProject = keys.length > 0 ? keys[0] : "";
    }
    // 2. Sync global issues with current project (if any)
    // Only sync if project.issues contains issue objects (not string IDs from server storage)
    if (_currentProject &&
        _projects[_currentProject]?.issues &&
        _projects[_currentProject].issues.length > 0) {
        const firstItem = _projects[_currentProject].issues[0];
        if (typeof firstItem === "object" && firstItem !== null && firstItem.id) {
            // Project has issue objects — sync them
            _issues = _projects[_currentProject].issues;
        }
        // If firstItem is a string, it's an ID list — keep _issues as-is (already set from storage)
    }
    // 3. Ensure project key exists
    if (_currentProject && _projects[_currentProject] && !_projects[_currentProject].key) {
        _projects[_currentProject].key = _currentProject.toUpperCase();
    }
}
// ===== Test contract =====
//
// Playwright specs in `tests/*.spec.mjs` use `page.evaluate(() => ...)` to
// read state directly from the page. That callback runs in a fresh global
// scope that has no ES-module imports, so it can only reach symbols that
// are also exposed on `window`. The previous `attach()` shim in
// `_attach.ts` did this for every export; removing that indirection
// (PR #19) means the few symbols tests actually need must be re-exposed
// explicitly here.
//
// This is intentionally a narrow, test-only concession — *not* a
// revival of the classic-script global. Real consumers should import
// from this module. Mirror of the `window.storage` test contract
// declared in `src/storage.ts`.
try {
    if (typeof window !== "undefined") {
        const w = window;
        w.getIssues = getIssues;
        w.getCurrentProject = getCurrentProject;
    }
}
catch {
    /* ignore — non-browser environment */
}
//# sourceMappingURL=state.js.map