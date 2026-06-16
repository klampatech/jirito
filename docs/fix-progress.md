# Jirito — Fix Progress Tracker

> **Started:** 2026-05-10
> **Based on:** docs/prioritized-fix-plan.md

---

## Phase 0: Quick Wins

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| Q1 | ✅ | Fix `--text-muted` contrast | `#8A7568` → `#6B6560` (8.5:1 on white). Also fixed `--label-text` which had same failing color. |
| Q2 | ✅ | Add `role="alert"` to toast notifications | Added to both `showToast()` and `showUndoToast()` |
| Q3 | ✅ | Add CSP meta tag to `<head>` | Added CSP allowing self, unsafe-inline styles, unpkg for Phosphor icons |
| Q4 | ✅ | Extract magic numbers into `constants.js` | Created `src/constants.js` with 14 named constants. Updated state.js, utils.js, events.js to use them. |
| Q5 | ✅ | Delete dead code | Commented out `undoDeleteIssue`, `undoMoveIssue` in utils.js. Removed `renderCalendar` from render.js (never called). |

## Phase 1: Stability

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| P1 | ✅ | Eliminate LJ global namespace pollution | Complete — All 240+ LJ. references replaced with getter/setter functions. 16 bare aliases removed. All 162 tests pass. |
<| P2 | ✅ | Split main.js into focused modules | Created 15 modules: main-projects.js, main-sprints.js, main-shortcuts.js, main-theme.js, main-onboarding.js, main-modals.js, main-notifications.js, main-column-config.js, main-export-import.js, main-bulk-actions.js, main-sidebar-toggle.js, main-save-filter.js, main-detail-panel.js, main-column-menu.js, main-filter-controls.js. main.js reduced to ~60 line thin orchestrator. All init() functions called from DOMContentLoaded. |
| P3 | ✅ | Deduplicate calendar rendering | Extracted shared `renderCalendarGrid(year, month)` from `renderCalendarView()`. Reused grid HTML generation. Removed deprecated `renderCalendar()` stub. 161 E2E tests pass. |
| P4 | ✅ | Add unit tests for core logic | Created 4 test files in `tests/unit/`: `markdown.test.js` (16 tests for parseMarkdown), `security.test.js` (18 tests for isSafeUrl + escapeHtml), `date-helpers.test.js` (19 tests for isOverdue, formatDate, timeAgo, getCalendarDays), `issue-helpers.test.js` (12 tests for generateIssueKey + lucideIcon). Total: 65 unit tests, all passing. Added `vitest` + `jsdom` as dev dependencies. Added `test:unit` script to package.json. |

## Phase 2: Quality

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| P5 | ❌ | Split events.js | detail-panel, drag-drop, toasts, bulk, filters |
| P6 | ✅ | Fix saveState() debounce pattern | Made saveState() debounced by default. Added saveStateImmediate(). Added beforeunload flush. |
| P7 | ✅ | Add input validation on import | Validate title length, status/type/priority against allowed sets, positive int id, sanitize labels/assignee/storyPoints. Sanitize project key. |
| P8 | ✅ (partial) | Fix remaining CSS accessibility | Contrast: --primary, --status-todo fixed light/dark. Added aria-label to checkboxes. Dark-mode consolidation remaining. |

## Phase 3: Performance

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| P9 | ❌ | Memoize `getFilteredIssues()` | Cache by filter state key |
| P10 | ❌ | Cache dependent counts per issue | Avoid O(n) filter per card |
| P11 | ❌ | Fix `initDragDrop()` DOM thrashing | Cache template, diff DOM |
| P12 | ❌ | Implement minimal diff-based render | Only update changed cards |

## Phase 4: Hardening

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| H1 | ❌ | Add visual regression testing | Playwright screenshot diffing |
| H2 | ❌ | Add focus trapping in detail panel | Keyboard users |
| H3 | ❌ | Add skip navigation link | 30 min |
| H4 | ❌ | Add `aria-label` to issue checkboxes | 1 hour |
| H5 | ❌ | Add mobile viewport functional tests | 2–3 days |
| H6 | ❌ | Add stress tests | 100+ issues |
| H7 | ✅ | Consider TypeScript migration | **Done** — full JS → TS migration landed across PRs #17, #18, #19 (see `.plan/plan-003-typescript-migration.md`). All 36 client modules + 15 server modules are `.ts`; committed `.js` artifacts are emitted by `tsc -b`. |
| H8 | ❌ | Add JSDoc to public API functions | 2–3 days |
