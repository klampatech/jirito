# Jirito — Prioritized Fix Plan

> **Date:** 2026-05-10
> Based on: In-depth code review (docs/code-review.md)
> **Status:** P1 + P2 + P3 + P4 complete. 162 E2E tests → 236 E2E + 66 Vitest unit tests (all green). **TypeScript migration is complete** — landed across PRs #17, #18, #19. See `.plan/plan-003-typescript-migration.md` for the plan and `.plan/plan-003-typescript-migration-progress.md` for the post-arc follow-up backlog.

---

## How to Read This Plan

Issues are ordered by **impact × effort ratio** — highest impact for lowest effort first.
Within the same priority tier, smaller wins come before larger refactors.

---

## Phase 0: Quick Wins (1–2 days, zero risk) ✅ COMPLETE

| # | Issue | Effort | Status |
|---|-------|--------|--------|
| **Q1** | Fix `--text-muted` contrast (`#8A7568` → `#6B6560` or `#595959`) | 15 min | ✅ Done |
| **Q2** | Add `role="alert"` to toast notifications | 30 min | ✅ Done |
| **Q3** | Add CSP meta tag to `<head>` | 15 min | ✅ Done |
| **Q4** | Extract all magic numbers into `constants.js` | 1 hour | ✅ Done |
| **Q5** | Delete dead code: `undoDeleteIssue()`, `undoMoveIssue()`, `renderCalendar()` | 15 min | ✅ Done |

**Total Phase 0 time: ~3 hours**

---

## Phase 1: Stability (1–2 weeks)

### P1: Eliminate LJ global namespace pollution ⭐ (Highest Impact) ✅ COMPLETE

**Files changed:** `state.js`, `render.js`, `events.js`, `main.js`, `data.js`, `utils.js`

**What was done:**
- Replaced `const LJ = { ... }` (14 properties) + 16 bare-module aliases with module-scoped state
- Created getter/setter accessors for every state property: `getIssues()`, `setIssues()`, `getIssueCounter()`, `getComments()`, `getCurrentProject()`, `setCurrentProject()`, `getCurrentView()`, `setCurrentView()`, `getProjects()`, `getSavedFilters()`, `setSavedFilters()`, `getActivityLog()`, `setActivityLog()`, `getSelectedIds()`, `getTrash()`, `setTrash()`, `getSprints()`, `setSprints()`, `getCustomColumns()`, `setCustomColumns()`, `getMarkdownCache()`
- Removed all 240+ `LJ.` references across 6 files
- Removed all 16 bare-module alias assignments
- Created `src/constants.js` with `LJ_CONSTANTS` object (replaces all magic numbers)

**Verification:** All 162 E2E tests pass. No `LJ.` references remain. No bare aliases remain.

**Remaining work:** None. This was the most impactful fix — it eliminates collision risk and makes the codebase testable.

---

### P2: Split main.js into focused modules ⭐ (Highest Impact)

**Files:** `main.js` → `main-projects.js`, `main-sprints.js`, `main-shortcuts.js`, `main-theme.js`, `main-modals.js`, `main-notifications.js`, `main-trash.js`, `main-onboarding.js`, `main-filters.js`, `main-sidebar.js`, `main-issue-form.js`

**Problem:** `main.js` is 300+ lines with 30+ event listeners, modal creation, project creation, sprint forms, column config, keyboard shortcuts, notification dropdowns, and theme toggling.

**Approach:**
1. Identify logical groupings of event listeners in `DOMContentLoaded`
2. Extract each group into its own module with an `init()` function
3. `main.js` becomes a thin orchestrator

**Effort:** 2–3 days
**Impact:** High — reduces cognitive load, improves testability

---

### P3: Deduplicate calendar rendering ⭐ (High Impact, Low Effort)

**Files:** `render.js`

**Problem:** `renderCalendarView()` and `renderCalendar()` share ~80% of the same HTML generation logic.

**Approach:**
1. Extract shared logic into `renderCalendarGrid(days, issues, context)`
2. `renderCalendarView()` and `renderCalendar()` both call `renderCalendarGrid()` with different wrappers
3. Delete the unused `renderCalendar()` if confirmed dead

**Effort:** 1 day
**Impact:** Medium — reduces code bloat

---

### P4: Add unit tests for core logic ⭐ (Highest Long-Term ROI)

**Files:** New `tests/unit/` directory

**Priority order for test coverage:**
1. `parseMarkdown()` — markdown parser (high bug risk, no coverage)
2. `isSafeUrl()` — security-critical
3. `hasCircularDependency()` — dependency cycle detection
4. `findDuplicateIssues()` — duplicate detection
5. `getCalendarDays()` — calendar helpers
6. `escapeHtml()` — XSS protection

**Effort:** 2–3 days (using Vitest or Jest)
**Impact:** Very High — prevents regressions in core logic

---

## Phase 2: Quality (2–4 weeks)

### P5: Split events.js

**Files:** `events.js` → `detail-panel.js`, `drag-drop.js`, `toasts.js`, `bulk-actions.js`, `filters.js`

**Problem:** `events.js` is 500+ lines mixing DOM event handling, business logic, and rendering.

**Approach:**
1. `openDetailPanel()` (200+ lines) → `detail-panel.js` with `initDetailPanel()`
2. `initDragDrop()` → `drag-drop.js` with `initDragDrop()`
3. Toast system → `toasts.js` with `toast()`, `undoToast()`
4. Bulk actions → `bulk-actions.js`
5. Filter logic → `filters.js`
6. Keep small helpers in `events.js` or move to `utils.js`

**Effort:** 3–4 days
**Impact:** High — improves testability and maintainability

---

### P6: Fix saveState() debounce pattern

**Files:** `state.js` (all callers)

**Problem:** `saveState()` is called synchronously in many places. `saveStateDebounced()` exists but isn't the default.

**Approach:**
1. Make `saveState()` the debounced default
2. Create `saveStateImmediate()` for critical operations
3. Audit all callers

**Effort:** 1–2 days
**Impact:** Medium — performance improvement on bulk operations

---

### P7: Add input validation on import

**Files:** `data.js` (`importData()`, `createProject()`)

**Approach:**
1. Validate each issue field: `title` length (< 500 chars), `status` in allowed set, `id` > 0
2. Sanitize `createProject()` keys (reject `/[^a-zA-Z0-9_-]/`)
3. Add validation tests

**Effort:** 1 day
**Impact:** Medium — prevents data corruption

---

### P8: Fix remaining CSS accessibility issues

**Files:** `styles.css`

**Approach:**
1. `--primary` button text contrast: `#DB8C61` → `#C77A50` (or add `font-weight: 700` for 3:1 exception)
2. Status dot "To Do" contrast improvement
3. Add `aria-label` to issue checkboxes
4. Consolidate dark-mode overrides using CSS variables (target: reduce from ~200 to < 20)
5. Replace inline `style.cssText` with CSS class toggling

**Effort:** 2–3 days
**Impact:** High — WCAG AA compliance

---

## Phase 3: Performance (ongoing)

| # | Issue | Effort | Approach |
|---|-------|--------|----------|
| **P9** | Memoize `getFilteredIssues()` | 1 day | Cache by filter-state key |
| **P10** | Cache dependent counts per issue | 1 day | Compute once per render cycle |
| **P11** | Fix `initDragDrop()` DOM thrashing | 1 day | Use `document.importNode()` with cached template |
| **P12** | Implement minimal diff-based render | 3–5 days | Track changed issue IDs, only update those cards |

---

## Phase 4: Hardening (ongoing)

| # | Issue | Effort |
|---|-------|--------|
| **H1** | Add visual regression testing (Playwright screenshot diffing) | 1–2 days |
| **H2** | Add focus trapping in detail panel | 1 day |
| **H3** | Add skip navigation link | 30 min |
| **H4** | Add `aria-label` descriptions to issue checkboxes | 1 hour |
| **H5** | Add mobile viewport functional tests | 2–3 days |
| **H6** | Add stress tests (100+ issues, rapid state changes) | 1 day |
| **H7** | Consider TypeScript migration (low priority) | Ongoing |
| **H8** | Add JSDoc to public API functions | 2–3 days |

---

## Summary: Effort & Impact Matrix

| Phase | Time | Effort | Impact | Risk | Status |
|-------|------|--------|--------|------|--------|
| **Phase 0: Quick Wins** | ~3 hours | Very Low | High (accessibility + security) | None | ✅ Complete |
| **Phase 1: Stability** | 1–2 weeks | High | Very High (core architecture) | Medium | P1 ✅, P2–P4 pending |
| **Phase 2: Quality** | 2–4 weeks | High | High (maintainability) | Medium | All pending |
| **Phase 3: Performance** | 1–2 weeks | Medium | Medium | Low | All pending |
| **Phase 4: Hardening** | Ongoing | Low per item | Low per item | None | All pending |

---

## Recommended Execution Order

```
Week 1:
  Day 1: Q1–Q5 (Quick Wins, ~3 hours) ✅ COMPLETE
  Day 2–3: P1 (Eliminate LJ global state) ✅ COMPLETE
  Day 4–5: P3 (Deduplicate calendar) + P4 (Unit tests for parseMarkdown + isSafeUrl)

Week 2:
  Day 1–2: P2 (Split main.js)
  Day 3–4: P4 continued (unit tests for remaining core logic)
  Day 5: P5 (split events.js — start with detail-panel.js)

Week 3:
  Day 1–2: P5 continued (drag-drop, toasts, filters)
  Day 3: P6 (fix saveState debounce)
  Day 4–5: P7 (input validation) + P8 (CSS accessibility)

Week 4+:
  P9–P12 (Performance)
  Phase 4 items (ongoing)
```

---

## Key Principle

**Fix the architecture before adding features.** The LJ global state and God function patterns will cause regressions on every future change. Eliminating them pays for itself in reduced debugging time within the first sprint.

---

## What's Next

1. **P2: Split main.js** — The next highest-impact refactor. The `DOMContentLoaded` handler has 30+ responsibilities that should be separated.
2. **P4: Unit tests** — With the global state eliminated, core logic functions are now pure and testable. This is the best time to add unit tests.
3. **P3: Deduplicate calendar** — Quick win that reduces code bloat.
