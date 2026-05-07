# Implementation Plan: All 29 Fixes for Jirito

## Overview
- **Created**: 2026-04-29
- **Objective**: Implement all 29 recommended enhancements and fixes for the Jirito project, excluding #20 (no backend).
- **Scope**: All 28 fixes across bug fixes, architecture, features, testing, and UX polish. No backend/API work.

## Context Summary
- Single-file vanilla HTML/CSS/JS app (~500 lines in app.js)
- Zero dependencies, localStorage persistence
- Playwright E2E tests (~30 tests, only in tests.spec.mjs)
- Design mimics Jira Cloud (rebranded as Jirito)
- 4 Kanban columns, multi-project support, comments, bulk actions

---

## Phase 1: Critical Bug Fixes
**Objective**: Fix correctness and security issues before adding features.
**Dependencies**: None

### Task 1.1: Fix duplicate event listeners in `openDetailPanel()`
- **Files**: `app.js`
- **Action**: Modify
- **Details**: 
  - The `change` event listeners on `#detail-summary`, `#detail-desc`, `#detail-priority`, `#detail-assignee` are re-wired on every call to `openDetailPanel()`, causing duplicate saves.
  - Fix: Use event delegation on `#detail-body` instead of attaching listeners per field, or detach old listeners before re-attaching.
  - Also fix `#comment-submit` and `#comment-input` listeners the same way.

### Task 1.2: Fix XSS in `renderListView()`
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - `renderListView()` uses `innerHTML` with `escapeHtml(issue.title)` but the table row template is built with string concatenation that doesn't escape all fields consistently.
  - Fix: Ensure all user content in `innerHTML` templates is escaped. Also audit `createCard()` and `renderBoard()` for any unescaped user content in `innerHTML`.

### Task 1.3: Fix `importData()` ID collision
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - If imported data has a lower `issueCounter`, new issues get duplicate IDs.
  - Fix: After importing, compute `issueCounter = Math.max(issueCounter, ...issues.map(i => i.id))`.
  - Also validate that imported issues have required fields (`id`, `title`, `status`).

### Task 1.4: Fix `applyFilters()` not clearing "No matching issues" message
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - `applyFilters()` creates a "No matching issues" div but doesn't remove old ones from previous calls, causing duplicates.
  - Fix: Clear the column body first, or check for existing `.no-results` elements before creating new ones.

### Task 1.5: Fix `deleteProject()` orphaned data
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - When a project is deleted, its issues array is not saved to localStorage, creating a data leak.
  - Fix: Explicitly delete the project's issues from any references and call `saveState()` after deletion.

---

## Phase 2: Architecture & Code Quality
**Objective**: Improve code maintainability and safety.
**Dependencies**: Phase 1 complete

### Task 2.1: Split `app.js` into logical modules
- **Files**: `app.js` → `state.js`, `render.js`, `events.js`, `data.js`, `utils.js`
- **Action**: Create new files, modify `index.html`
- **Details**:
  - `utils.js`: `escapeHtml()`, `isOverdue()`, `formatDate()`, `timeAgo()`
  - `state.js`: `issues`, `issueCounter`, `comments`, `currentProject`, `currentView`, `projects`, `savedFilters`, `activityLog`, `selectedIds`, `loadState()`, `saveState()`
  - `render.js`: `renderBoard()`, `createCard()`, `updateCounts()`, `renderSidebar()`, `renderProjects()`, `renderViews()`, `renderSavedFilters()`, `renderActivity()`, `renderListView()`, `switchView()`, `switchProject()`
  - `events.js`: All event listeners, drag & drop init, modal handlers, filter handlers, bulk action handlers
  - `data.js`: `exportData()`, `importData()`, `createProject()`, `deleteProject()`, `addActivity()`
  - Update `index.html` to load modules in correct order (or use a single bundled approach with `<script type="module">`)

### Task 2.2: Add TypeScript types (optional but recommended)
- **Files**: `app.js` → `app.ts` (or `.d.ts` shim)
- **Action**: Create
- **Details**:
  - Define interfaces: `Issue`, `Comment`, `Project`, `SavedFilter`, `ActivityLog`
  - Type `comments` as `Record<number, Comment[]>`
  - Add JSDoc comments to all public functions for IDE support
  - This is a low-risk, high-value addition that catches the bugs fixed in Phase 1

### Task 2.3: Fix `timeAgo()` for future dates
- **Files**: `utils.js` (from 2.1)
- **Action**: Modify
- **Details**:
  - `timeAgo()` returns negative values for future dates.
  - Fix: Check if `date > now` and return "In X days" or "Due in X days" instead.

---

## Phase 3: Feature Additions
**Objective**: Add the most impactful missing features.
**Dependencies**: Phase 2 complete

### Task 3.1: Add labels / custom fields to issues
- **Files**: `app.js`, `index.html`, `styles.css`
- **Action**: Modify all
- **Details**:
  - Add `labels: string[]` to the `Issue` type and all issue objects.
  - Add a labels input field in the create/edit modal and detail panel.
  - Support comma-separated input; render as colored tags.
  - Add labels to the filter dropdown (extract unique labels from all issues).
  - Update `exportData()` / `importData()` to include labels.

### Task 3.2: Add drag-to-reorder within columns
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - Add `dragover` position detection in `initDragDrop()`.
  - On `dragover`, calculate the Y position relative to sibling cards and insert a visual placeholder.
  - On `drop`, reorder the `issues` array instead of just changing status.
  - Use `e.clientY` relative to the column body to determine insertion point.

### Task 3.3: Add issue history / changelog
- **Files**: `app.js`, `index.html`, `styles.css`
- **Action**: Modify all
- **Details**:
  - Add `history: [{ field, from, to, date, user }]` to each issue.
  - On every field change (title, desc, priority, assignee, status), push a history entry.
  - Add a "History" tab/section in the detail panel showing the timeline.
  - Limit history to last 50 entries per issue to prevent localStorage bloat.

### Task 3.4: Add issue cloning
- **Files**: `app.js`, `index.html`
- **Action**: Modify
- **Details**:
  - Add a "Clone" button in the detail panel header (next to Delete).
  - On click, create a new issue with all fields copied except `id`, `status` (set to "todo"), and `history` (cleared).
  - Increment `issueCounter` and add to current project.
  - Show a toast or notification: "Issue cloned as PROJ-{newId}".

### Task 3.5: Add bulk priority/assignee edit
- **Files**: `app.js`, `index.html`, `styles.css`
- **Action**: Modify all
- **Details**:
  - Extend the bulk action bar (`#bulk-bar`) to include priority and assignee dropdowns.
  - Add `handleBulkPriorityChange()` and `handleBulkAssigneeChange()` handlers.
  - Style consistently with existing bulk bar elements.
  - Update `updateBulkBar()` to show/hide new controls.

### Task 3.6: Add keyboard navigation
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - Arrow keys (↑/↓) to move focus between cards in the active column.
  - Enter to open detail panel for focused card.
  - Tab order through modal form fields.
  - Escape to close modals/panels (already partially implemented — ensure consistency).
  - Use `focus()` and `tabindex` attributes on cards.

---

## Phase 4: UX & Polish
**Objective**: Improve user experience and visual polish.
**Dependencies**: Phase 3 complete

### Task 4.1: Add dark mode
- **Files**: `styles.css`, `app.js`, `index.html`
- **Action**: Modify all
- **Details**:
  - Add a dark mode toggle in the top nav (near the avatar).
  - Use CSS custom properties (variables) for all colors, with `:root` and `[data-theme="dark"]` overrides.
  - Persist theme preference in localStorage (`jirito-theme`).
  - Respect `prefers-color-scheme` as default.
  - Dark palette: dark backgrounds (#1B1F24), lighter cards (#292E34), adjusted text colors.

### Task 4.2: Add notification dropdown
- **Files**: `app.js`, `styles.css`
- **Action**: Modify all
- **Details**:
  - Clicking the notification bell shows a dropdown with overdue issues.
  - Each entry shows the issue key, title, and due date.
  - Clicking an entry opens the detail panel for that issue.
  - Clicking outside closes the dropdown.
  - Style to match the column menu dropdown pattern already in the code.

### Task 4.3: Add undo / trash
- **Files**: `app.js`, `index.html`, `styles.css`
- **Action**: Modify all
- **Details**:
  - Add a `trash` array to state: `{ issues: [...], date: Date }`.
  - On delete, move the issue to `trash` instead of removing it.
  - Add a "Trash" section in the sidebar (or a "Recently Deleted" banner).
  - Add an "Undo" toast/banner that appears for 30 seconds after deletion.
  - Auto-purge trash entries older than 7 days.

### Task 4.4: Fix column widths to be responsive
- **Files**: `styles.css`
- **Action**: Modify
- **Details**:
  - Change `min-width: 272px; max-width: 272px` to `flex: 0 0 auto; min-width: 240px;` on `.column`.
  - Allow columns to grow/shrink based on content.
  - Add `overflow-x: auto` on `.board` for horizontal scrolling on small screens.

### Task 4.5: Add onboarding / empty state
- **Files**: `app.js`, `index.html`, `styles.css`
- **Action**: Modify all
- **Details**:
  - On first load (no localStorage data), show a welcome overlay with a brief tour.
  - When a column has no issues, show a "No issues yet" illustration/message.
  - Use a simple step-by-step tooltip flow: "Create an issue" → "Drag to move" → "Click to edit".
  - Persist "seen onboarding" flag in localStorage.

### Task 4.6: Fix `PROJ-` key prefix to use actual project key
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - The issue key always shows `PROJ-{id}` but should use the project's key (e.g., `PHX-1`).
  - Update `createCard()`, `openDetailPanel()`, and `addActivity()` to use `projects[currentProject].key`.
  - Add a `key` field to the `Project` type if not already present (it exists in the form but may not be stored).

### Task 4.7: Add loading states for import/export
- **Files**: `app.js`
- **Action**: Modify
- **Details**:
  - Show a spinner or "Processing..." text during import/export.
  - Disable the import/export buttons during processing.
  - Show success/error toasts instead of `alert()` for better UX.

---

## Phase 5: Testing
**Objective**: Improve test coverage and quality.
**Dependencies**: None (can run in parallel with other phases)

### Task 5.1: Clean up duplicate test files
- **Files**: `tests.spec.cjs`, `tests.spec.js`, `tests-new.spec.mjs`
- **Action**: Delete
- **Details**:
  - Only `tests.spec.mjs` is referenced in `playwright.config.js`.
  - Delete the other 3 test files.
  - Verify `npm test` still passes.

### Task 5.2: Add tests for detail panel, comments, filters, project switching
- **Files**: `tests.spec.mjs`
- **Action**: Modify
- **Details**:
  - Test detail panel opens on card click.
  - Test editing summary/priority/assignee in detail panel saves correctly.
  - Test adding comments and verifying the comment count badge updates.
  - Test filter dropdowns (type, priority, assignee) filter correctly.
  - Test search input filters by title and description.
  - Test project switching updates the board and project name.
  - Test saved filters can be saved and re-applied.

### Task 5.3: Replace `page.waitForTimeout()` with proper assertions
- **Files**: `tests.spec.mjs`
- **Action**: Modify
- **Details**:
  - Replace all `page.waitForTimeout(300)` with `expect().toBeVisible()` or `expect().toHaveText()` with explicit timeouts.
  - Replace `page.waitForTimeout(200)` in drag tests with `expect().toHaveCount()` with a timeout.
  - This makes tests more reliable and faster.

---

## File Manifest

| Action | Path | Description |
|--------|------|-------------|
| Create | `.plan/plan-001-all-29-fixes.md` | This plan document |
| Create | `utils.js` | Utility functions (extracted from app.js) |
| Create | `state.js` | State management (extracted from app.js) |
| Create | `render.js` | All rendering functions (extracted from app.js) |
| Create | `events.js` | All event listeners and handlers (extracted from app.js) |
| Create | `data.js` | Import/export, project CRUD, activity logging (extracted from app.js) |
| Modify | `index.html` | Update script tags to load modules |
| Modify | `styles.css` | Responsive columns, dark mode, trash UI, onboarding, notification dropdown |
| Modify | `app.js` | All 28 fixes (or replace entirely with module files) |
| Delete | `tests.spec.cjs` | Duplicate test file |
| Delete | `tests.spec.js` | Duplicate test file |
| Delete | `tests-new.spec.mjs` | Duplicate test file |
| Modify | `tests.spec.mjs` | New tests + replace waitForTimeout |
| Modify | `playwright.config.js` | Verify testMatch is correct |

---

## Success Criteria

- [ ] All 28 fixes implemented (excluding #20 backend)
- [ ] `npm test` passes with all tests (including new ones)
- [ ] No duplicate event listeners (detail panel edits save exactly once)
- [ ] No XSS vectors (all user content escaped)
- [ ] Import/export round-trips correctly with no ID collisions
- [ ] Dark mode toggle works and persists
- [ ] Drag-to-reorder within columns works
- [ ] Issue history is visible in detail panel
- [ ] Labels can be added/filtered on issues
- [ ] Bulk priority/assignee edit works
- [ ] Issue cloning works
- [ ] Keyboard navigation works (arrow keys, Enter, Escape)
- [ ] Notification bell shows dropdown of overdue issues
- [ ] Undo toast appears after deletion
- [ ] Columns are responsive (not fixed width)
- [ ] Issue keys use actual project key prefix (not hardcoded PROJ-)
- [ ] Onboarding shown on first load
- [ ] All duplicate test files removed
- [ ] No `waitForTimeout` in tests
- [ ] Code is split into logical modules (not one 500-line file)

## Notes

- **Risk**: Splitting `app.js` into modules requires careful attention to variable scoping and the global state object. Consider keeping a single `state` object exported from `state.js` that all modules import.
- **Risk**: Dark mode requires converting all hardcoded colors to CSS custom properties. This is the most CSS-intensive change.
- **Risk**: The module split changes the script loading order. Use `<script type="module">` in `index.html` and ensure imports are correct.
- **Note**: All fixes are additive or corrective — no breaking changes to the data format except the optional `labels` field (which is backward compatible since importData already handles missing fields).
- **Note**: The plan excludes #20 (backend/API) as requested. If a lightweight sync is desired later, Firebase or Supabase would be the simplest options.
