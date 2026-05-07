# Implementation Plan: Code Review Recommendations (16 Fixes)

## Overview
- **Created**: 2026-04-30
- **Objective**: Implement all 16 code review recommendations from the Jirito code review
- **Scope**: Bug fixes, architecture improvements, UX polish, and test hardening
- **Priority**: Critical bugs first, then architecture, then features/polish

---

## Phase 1: Critical Bug Fixes

### Task 1.1: Fix duplicate event listeners in `openDetailPanel()`
- **Files**: `events.js`
- **Severity**: High — causes triple `saveState()` calls and triple `renderBoard()` renders
- **Details**:
  - `openDetailPanel()` appends a `change` event listener to `#detail-body` on every call without removing the old one
  - Also re-wires `#comment-submit` and `#comment-input` listeners each time
  - **Fix**: Attach the `change` listener once on DOMContentLoaded and store the handler reference. Remove it before re-attaching, or use a flag to prevent double-wiring.
  - Same approach for comment submit/input listeners.

### Task 1.2: Validate `data.projects` structure in `importData()`
- **Files**: `data.js`
- **Severity**: High — untrusted data assigned directly to `projects`
- **Details**:
  - `importData()` does `projects = data.projects || { default: ... }` without validation
  - A corrupted or malicious export could inject arbitrary objects
  - **Fix**: Add `if (typeof data.projects !== 'object' || Array.isArray(data.projects)) throw new Error('Invalid projects format')` before assignment
  - Also validate that each project has `name` and `key` fields

### Task 1.3: Validate `data.comments` structure in `importData()`
- **Files**: `data.js`
- **Severity**: Medium — `comments` assigned without type check
- **Details**:
  - `comments` is treated as `{ issueId: [{ author, text, date }] }` but no validation
  - If imported as a string/array, app breaks later
  - **Fix**: Add `if (typeof data.comments !== 'object' || Array.isArray(data.comments)) throw new Error('Invalid comments format')`

### Task 1.4: Fix onboarding visibility logic
- **Files**: `main.js`
- **Severity**: Medium — onboarding never shows on first load
- **Details**:
  - `checkOnboarding()` checks `localStorage.getItem('jirito-issues')` and bails if null
  - On first load there's no issues data, so onboarding is skipped — defeating its purpose
  - **Fix**: Remove the `hasData` check. Show onboarding whenever `!localStorage.getItem('jirito-onboarding')`

---

## Phase 2: Architecture & Code Quality

### Task 2.1: Add namespace to prevent global pollution
- **Files**: `main.js` (top), `index.html` (wrap)
- **Severity**: Medium — all variables/functions are global
- **Details**:
  - 6 script files all pollute the global scope with `issues`, `issueCounter`, `projects`, `comments`, `trash`, `selectedIds`, `escapeHtml`, `renderBoard`, `openDetailPanel`, etc.
  - **Fix**: Wrap all script content in an IIFE or create a `window.LittleJira` namespace object
  - Recommended approach: Create a single `state` object exported from `state.js` pattern — define `window.LJ = { issues, issueCounter, projects, comments, trash, selectedIds, currentProject, currentView, savedFilters, activityLog, issueCounter }` and reference everything through it
  - Update all cross-file references to use `LJ.` prefix

### Task 2.2: Consolidate `loadState()` migration logic
- **Files**: `state.js` + `main.js`
- **Severity**: Medium — 5 convoluted if-branches, first assignment immediately overwritten
- **Details**:
  - `main.js` has this migration block:
    ```js
    if (!projects['default']) { projects['default'] = { name: 'Project Alpha', icon: '📋', key: 'PROJ', issues: issues.length > 0 ? issues : [...sampleIssues] }; }
    if (issues.length > 0 && !projects['default'].issues.length) { projects['default'].issues = issues; }
    if (projects[currentProject] && !projects[currentProject].issues.length) { projects[currentProject].issues = issues.length > 0 ? issues : [...sampleIssues]; }
    if (issues.length === 0 && projects[currentProject].issues.length > 0) { issues = projects[currentProject].issues; }
    issues = projects[currentProject].issues;
    ```
  - The first assignment is immediately overwritten by the last line
  - **Fix**: Extract into a single `initializeData()` function in `state.js` with clear, linear logic:
    1. Load from localStorage (or use sample data)
    2. Ensure `projects['default']` exists
    3. Sync `issues` with `projects[currentProject].issues`
    4. Ensure project key exists
  - Remove the migration block from `main.js`

### Task 2.3: Add `debounce` to `applyFilters()`
- **Files**: `main.js`
- **Severity**: Low — unnecessary DOM rebuilds on every keystroke
- **Details**:
  - `search-input` fires `applyFilters()` on every `input` event
  - For boards with many cards, this causes repeated full DOM rebuilds
  - **Fix**: Add a 200ms debounce:
    ```js
    let filterTimeout;
    document.getElementById('search-input').addEventListener('input', () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(applyFilters, 200);
    });
    ```

### Task 2.4: Add `switchProject()` key validation
- **Files**: `render.js`
- **Severity**: Low — silent failure if key is undefined
- **Details**:
  - `switchProject(key)` does `issues = projects[key].issues` without checking if `projects[key]` exists
  - **Fix**: Add `if (!projects[key]) return;` at the top of `switchProject()`

### Task 2.5: Fix `showUndoToast()` memory leak risk
- **Files**: `events.js`
- **Severity**: Low — stale closures if toast dismissed and reappears
- **Details**:
  - `showUndoToast()` does `document.getElementById('undo-btn').addEventListener('click', ...)`
  - If the toast is removed via timeout and a new one appears, a new listener is added to a potentially stale element
  - **Fix**: Use event delegation on `document.body` for toast buttons:
    ```js
    document.body.addEventListener('click', (e) => {
      if (e.target.id === 'undo-btn' && currentUndoCallback) {
        currentUndoCallback();
        removeUndoToast();
      }
    });
    ```

---

## Phase 3: UX & Accessibility

### Task 3.1: Add `aria-live` regions for dynamic content
- **Files**: `index.html`
- **Severity**: Low — screen readers won't announce changes
- **Details**:
  - Board columns, activity feed, and notification dropdown update dynamically
  - **Fix**: Add `aria-live="polite"` to:
    - `.board` (for card count changes)
    - `#activity-feed` (for new activity entries)
    - `#notification-dropdown-body` (for new overdue issues)
  - Add `role="status"` to the bulk action bar for selection count updates

### Task 3.2: Fix `renderListView()` escaping consistency
- **Files**: `render.js`
- **Severity**: Low — audit all `innerHTML` for escaping gaps
- **Details**:
  - `renderListView()` uses `escapeHtml()` for `title` and `type` but `generateIssueKey()` returns unescaped text (low risk since keys are trusted)
  - `createCard()` has many string interpolations — audit each one
  - **Fix**: Audit all `innerHTML` assignments across `renderBoard()`, `createCard()`, `openDetailPanel()`, `renderListView()`, `renderTrash()` and verify every user-controlled value is passed through `escapeHtml()`

### Task 3.3: Add `aria-label` to column bodies for drag targets
- **Files**: `index.html`
- **Severity**: Low — accessibility for drag-and-drop
- **Details**:
  - `.column-body` elements are drag targets but have no ARIA labels
  - **Fix**: Add `role="list"` and `aria-label` to each column body:
    ```html
    <div class="column-body" data-status="todo" role="list" aria-label="To Do column">
    ```

---

## Phase 4: Testing & DevOps

### Task 4.1: Replace hardcoded absolute path in `playwright.config.js`
- **Files**: `playwright.config.js`
- **Severity**: Medium — tests won't run on other machines
- **Details**:
  - `baseURL: 'file:///Users/kylelampa/Development/little-coder/jira-clone/index.html'` is machine-specific
  - **Fix**: Use `__dirname` for portability:
    ```js
    import { defineConfig } from '@playwright/test';
    import { fileURLToPath } from 'url';
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    export default defineConfig({
      testDir: '.',
      testMatch: 'tests.spec.mjs',
      use: {
        baseURL: 'file://' + __dirname + 'index.html',
      },
    });
    ```
  - Alternatively, use a local HTTP server approach with `@playwright/test`'s built-in server

### Task 4.2: Add tests for new functionality
- **Files**: `tests.spec.mjs`
- **Severity**: Low — ensure new features are covered
- **Details**:
  - Test onboarding shows on first load (with cleared localStorage)
  - Test onboarding doesn't show after being dismissed
  - Test import validation rejects malformed data
  - Test debounce doesn't break search (rapid keystrokes still filter)
  - Test `switchProject()` with invalid key is a no-op
  - Test `aria-live` attributes exist on dynamic regions

---

## Phase 5: Cleanup & Polish

### Task 5.1: Document `selectedIds` as intentionally ephemeral
- **Files**: `state.js`
- **Severity**: Trivial — developer confusion
- **Details**:
  - `selectedIds` is a `Set` that is never persisted to localStorage
  - This is correct (bulk selection is ephemeral), but could confuse future developers
  - **Fix**: Add a comment: `// Intentionally not persisted — bulk selection is ephemeral across page reloads`

### Task 5.2: Add JSDoc to public functions
- **Files**: All JS files
- **Severity**: Low — IDE support and onboarding
- **Details**:
  - Add JSDoc `@param` and `@returns` to all public functions:
    - `escapeHtml()`, `isOverdue()`, `formatDate()`, `timeAgo()`, `generateIssueKey()`, `getProjectKey()`, `getFilteredIssues()`, `getAllLabels()`
    - `loadState()`, `saveState()`, `purgeTrash()`, `moveToTrash()`, `restoreFromTrash()`
    - `renderBoard()`, `createCard()`, `updateCounts()`, `renderSidebar()`, `renderProjects()`, `renderViews()`, `renderSavedFilters()`, `renderActivity()`, `switchProject()`, `switchView()`, `renderListView()`
    - `openDetailPanel()`, `closeDetailPanel()`, `deleteIssue()`, `cloneIssue()`, `addComment()`, `trackHistory()`
    - `exportData()`, `importData()`, `createProject()`, `deleteProject()`
    - `applyFilters()`, `saveCurrentFilter()`, `applySavedFilter()`, `populateAssigneeFilter()`
    - `showToast()`, `showUndoToast()`
  - Define TypeScript-like interfaces via JSDoc `@typedef`:
    ```js
    /** @typedef {Object} Issue
     *  @property {number} id
     *  @property {string} title
     *  @property {string} desc
     *  @property {string} type
     *  @property {string} priority
     *  @property {string} assignee
     *  @property {string} status
     *  @property {string|null} dueDate
     *  @property {string[]} labels
     *  @property {Array<{field:string,from:string,to:string,date:string,user:string}>} history
     */
    ```

---

## File Manifest

| # | Action | Path | Task |
|---|--------|------|------|
| 1 | Modify | `events.js` | 1.1 Fix duplicate event listeners |
| 2 | Modify | `data.js` | 1.2 Validate `data.projects` in import |
| 3 | Modify | `data.js` | 1.3 Validate `data.comments` in import |
| 4 | Modify | `main.js` | 1.4 Fix onboarding visibility |
| 5 | Modify | `main.js` + `state.js` | 2.1 Add `LJ` namespace |
| 6 | Modify | `state.js` + `main.js` | 2.2 Consolidate migration logic |
| 7 | Modify | `main.js` | 2.3 Add debounce to search |
| 8 | Modify | `render.js` | 2.4 Add `switchProject()` validation |
| 9 | Modify | `events.js` | 2.5 Fix `showUndoToast()` leak |
| 10 | Modify | `index.html` | 3.1 Add `aria-live` regions |
| 11 | Modify | `render.js` | 3.2 Audit escaping in `renderListView()` |
| 12 | Modify | `index.html` | 3.3 Add ARIA labels to column bodies |
| 13 | Modify | `playwright.config.js` | 4.1 Replace hardcoded path |
| 14 | Modify | `tests.spec.mjs` | 4.2 Add tests for new functionality |
| 15 | Modify | `state.js` | 5.1 Comment on `selectedIds` |
| 16 | Modify | All JS files | 5.2 Add JSDoc to public functions |

---

## Execution Order & Dependencies

```
Phase 1 (Critical) → Phase 2 (Architecture) → Phase 3 (UX) → Phase 4 (Testing) → Phase 5 (Cleanup)
```

**Dependencies:**
- Task 2.1 (namespace) must be done before any other task that touches multiple files, as it changes the reference pattern for all global state
- Task 2.2 (migration consolidation) should be done before Phase 3+ to reduce cognitive load
- Task 4.1 (playwright config) can be done anytime but should be verified before running tests
- Task 5.2 (JSDoc) can be done last as it's documentation-only

**Estimated effort:** ~4-6 hours (mostly in careful refactoring of state references and testing)

## Success Criteria

- [ ] No duplicate event listeners (detail panel edits save exactly once)
- [ ] Import validation rejects malformed data without crashing
- [ ] Onboarding shows on first load (no localStorage data)
- [ ] All state references use `LJ.` namespace prefix
- [ ] Migration logic is a single `initializeData()` function
- [ ] Search input is debounced (200ms)
- [ ] `switchProject()` validates key before use
- [ ] No stale event listeners in toast system
- [ ] `aria-live` regions present on all dynamic content
- [ ] All `innerHTML` user content is escaped
- [ ] Playwright config works on any machine
- [ ] New tests added for all new functionality
- [ ] `selectedIds` documented as ephemeral
- [ ] All public functions have JSDoc
