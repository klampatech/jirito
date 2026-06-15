# Jirito — In-Depth Code Review

> **Original review:** 2026-05-10
> **Last updated:** 2026-06-15 — annotated to reflect the TypeScript migration in `.plan/plan-003-typescript-migration.md` (phases 0–8 complete, branch `feature/backend`).
> **Scope:** Full codebase (client + server, TypeScript, CSS, HTML, tests)
> **Status:** Original findings retained; status of each item updated.

---

## 1. Architecture & Design

### Strengths

- **Clean module separation:** 6 focused JS files (state, render, events, data, utils, main) with clear responsibility boundaries
- **Good data layer:** Import/export with validation, trash with auto-purge, sprint management, custom columns per project, project-based issue isolation
- **Undo system:** Toast-based undo for every mutation is a great UX pattern
- **Markdown support:** Lightweight parser with XSS-safe URL filtering (`isSafeUrl` blocks `javascript:`, `data:`, `vbscript:` schemes)
- **CI/CD:** GitHub Actions workflow properly configured with artifact upload on failure
- **ESLint + Prettier:** Configured and in use
- **package-lock.json:** Present for reproducibility
- **Extensive test coverage:** ~150 Playwright E2E tests covering core flows

### Concerns

**CRITICAL (partial progress): LJ global namespace pollution**

```typescript
// src/state.ts — LJ object is preserved as the live state container
const LJ = { issues: [], issueCounter: 100, /* ...50+ keys */ };
```

The `LJ` object plus 16 bare-module-level aliases (`let issues = LJ.issues; let issueCounter = LJ.issueCounter; ...`) still exist and are still mutated across the codebase. The TypeScript migration (`.plan/plan-003-typescript-migration.md` §10.2) flagged this as a follow-up: the migration's goal was to add types, not to refactor global state. The 16 alias variables are a clear cleanup target.

**Status:** the migration preserved `LJ` exactly; the proper fix is a typed store (singleton class with `getState()` / `setState(patch)` / `subscribe(listener)`). Tracked as a follow-up — see §10.2 of the migration plan and the roadmap in `docs/PROJECT.md`.

**CRITICAL (partial progress): bootstrap was a 300+ line God function**

The pre-migration `main.js` registered 30+ event listeners in a single `DOMContentLoaded` handler. The TypeScript migration split this into 19 `main-*.ts` files (one per feature area) plus a thin `main.ts` orchestrator, so the listener registration is now distributed. Each `main-*.ts` is still a fairly large function (the largest are sprint/project flows), but no single file carries the whole bootstrap.

**Status:** partial progress — distribution done, per-feature simplification is a follow-up.

**HIGH (partial progress): render module is large with multiple concerns**

`renderBoard()`, `createCard()`, `renderSidebar()`, `renderProjects()`, `renderColumnConfig()`, `renderCalendarView()`, `renderCalendar()`, `renderDashboardView()`, `renderListView()`, `renderSavedFilters()`, `renderActivity()` — 11 functions, no single responsibility. The migration moved them into `src/render.ts` (~1,300 lines) with the same shape. `renderCalendarView()` and `renderCalendar()` remain nearly identical (the duplicate is still present).

**Status:** the duplicate code is now in a single typed file, but the refactor itself is still owed. Tracked as a follow-up.

**HIGH (partial progress): events module is large and mixes concerns**

`src/events.ts` is now ~1,600 lines and contains the same mix: `openDetailPanel()`, `initDragDrop()`, `initMarkdownToggles()`, `cloneIssue()`, `deleteIssue()`, `addComment()`, bulk action handlers, filter logic, toast system, sprint list rendering, project CRUD, and undo. The migration preserved the structure verbatim — types and exports were added, behavior is unchanged.

**Status:** the module is fully typed and behaviour-preserving; the split into per-feature event modules is still owed.

**MEDIUM: No input validation on import**

While `importData()` validates projects structure, it doesn't validate individual issue fields (e.g., `id` could be negative, `title` could be 10KB, `status` could be arbitrary). The `createProject()` function allows any key without sanitization.

**MEDIUM (partial progress): saveState() writes 9 localStorage keys synchronously**

The migration made `saveState()` the debounced entry point and removed the `saveStateDebounced()` alias. The events.ts sprint-activation paths that previously called a missing `saveSprints()` helper now correctly call `saveState()`. The direct-save call sites flagged here (`trackHistory()`, `addDependency()`, `removeDependency()`) are still direct — the migration's stated goal was to add types, not to revisit the save semantics.

**Status:** API is unified (one debounced `saveState()`); per-site debounce discipline is a follow-up.

---

## 2. Code Quality Issues

### Duplicated Code

| # | Duplicate | Details |
|---|-----------|---------|
| 1 | `renderCalendarView()` and `renderCalendar()` in render.js | Nearly identical calendar rendering functions. One is the "board area" version, one is the "sidebar" version. They share ~80% of the same HTML generation logic. |
| 2 | `switchProject()` and `initializeData()` | Both repeat the same alias-syncing block (16 lines of `issues = LJ.issues; issueCounter = LJ.issueCounter; ...`). |
| 3 | Notification dropdown positioning | Computed twice (once on bell click, once on render). |
| 4 | Card creation logic | In `renderBoard()` and `applyFilters()` both call `createCard()`, but the filtering logic is duplicated in `applyFilters()` and `getFilteredIssues()`. |

### Magic Numbers

| Location | Magic Number | Suggested Constant |
|----------|-------------|-------------------|
| `state.js` | `50` (activity log max) | `ACTIVITY_LOG_MAX` |
| `state.js` | `7 * 24 * 60 * 60 * 1000` (trash purge) | `TRASH_RETENTION_MS` |
| `state.js` | `100` (issue counter default) | `ISSUE_COUNTER_START` |
| `state.js` | `0.6` (duplicate detection threshold) | `DUPLICATE_WORD_OVERLAP` |
| `utils.js` | `42` (calendar grid rows) | `CALENDAR_MAX_ROWS` |
| `utils.js` | `200` (history limit) | `HISTORY_MAX_ENTRIES` |
| `events.js` | `50` (history limit in `trackHistory`) | `HISTORY_MAX_ENTRIES` |
| `events.js` | `200` (debounce ms for dep search) | `DEP_SEARCH_DEBOUNCE_MS` |

### Inconsistent Patterns

- Some functions use `\|\|` for defaults, others use `??`, and some use `if (!x) return` guards inconsistently
- ~~`saveState()` vs `saveStateDebounced()` vs `saveStateImmediate()`~~ — resolved: `saveState()` is the only public name, and it is the debounced one. `saveStateImmediate()` is also exported for the rare cases that need to bypass the debounce.
- `getSprints()` returns `LJ.sprints` but creates a default `{}` if undefined — should be initialized in `loadState()` instead
- `trackHistory()` is called with string values but stores them as `String(from)` — inconsistent with numeric values

### Unused / Dead Code

- `undoDeleteIssue()` and `undoMoveIssue()` in utils.js are defined but never called — the undo logic is inlined in event handlers instead
- `renderCalendar()` (sidebar version) is never called from main.js — only `renderCalendarView()` (board version) is used
- `_detailChangeHandler` cleanup in `openDetailPanel()` removes/adds event listeners but the cleanup logic is fragile (relies on `body.removeEventListener('change', handler)` which won't find the handler if it was bound to a different element)

---

## 3. Security Review

### ✅ Good: XSS Mitigations

- `escapeHtml()` function used consistently for all dynamic content
- `isSafeUrl()` blocks `javascript:`, `data:`, `vbscript:` URL schemes in markdown links
- Markdown parser uses `escapeHtml(text)` before any HTML generation

### ⚠️ Concerns

| # | Issue | Severity |
|---|-------|----------|
| 1 | `data:` URLs in `<img>` tags: The markdown parser handles `[text](url)` links but doesn't handle `![]()` image syntax. If the code is extended to support images, `data:` URLs would be a vector. | Medium |
| 2 | `rel="noopener"` is present ✅ — good practice for external links | — |
| 3 | No CSP: The app has no Content-Security-Policy meta tag or header. Adding one would prevent inline script execution attacks. | High |
| 4 | localStorage is unencrypted: Any browser extension with read access can see all project data, comments, and issue details. | Low |
| 5 | `prompt()` for filter names: The `saveCurrentFilter()` function uses `prompt()` which can be spoofed. Not a security issue but poor UX. | Low |
| 6 | `confirm()` dialogs: Used in `deleteIssue()`, `deleteProject()`, `handleBulkDelete()`, `addCustomColumn()`. These are blocking and can be bypassed by scripts. | Low |

---

## 4. Performance Review

### Bottlenecks

| # | Issue | Impact |
|---|-------|--------|
| 1 | Full DOM rebuild on every state change: `renderBoard()` clears and rebuilds all columns and cards. For 100+ issues, this will be noticeable. | High |
| 2 | Repeated filtering: `getFilteredIssues()` is called on every render. No memoization. | Medium |
| 3 | `getSprints()` called in `createCard()` for every card — O(n) sprint lookup per card. | Medium |
| 4 | `getDependents()` does a full `LJ.issues.filter()` — called on every card render. | Medium |
| 5 | `initDragDrop()` clones all column-bodies on every `renderBoard()` call — DOM thrashing. | High |
| 6 | Calendar recomputes on every navigation — `getCalendarDays()` filters all issues for every day. | Medium |

### Recommendations

- Implement a minimal diff-based render for card updates (only update changed cards)
- Memoize `getFilteredIssues()` results keyed by filter state
- Cache dependent counts per issue rather than recomputing
- Use `requestAnimationFrame` or `setTimeout(0)` for heavy DOM operations

---

## 5. Accessibility Review

### ✅ Good

- `aria-live="polite"` on board, activity feed, and notification dropdown
- `role="status"` on bulk action bar
- `role="list"` on column bodies
- `aria-label` on column bodies
- Keyboard navigation (Enter/Space to open detail, arrow keys for cards)
- `tabindex="0"` on cards

### ⚠️ Issues

| # | Issue | Severity |
|---|-------|----------|
| 1 | `--text-muted` fails WCAG AA in light theme (~2.8:1 ratio vs 4.5:1 required) | **High** |
| 2 | Status dot for "To Do" has poor contrast — gray on light bg | Medium |
| 3 | No `aria-label` on issue checkboxes — screen readers can't describe their purpose | Medium |
| 4 | Toast notifications lack `role="alert"` — screen readers won't announce them | Medium |
| 5 | Detail panel doesn't trap focus — users can tab to elements behind it | Medium |
| 6 | No skip navigation link — keyboard users must tab through everything | Low |
| 7 | Column menu uses inline styles — not theme-aware, potentially low contrast | Low |

---

## 6. Testing Review

### ✅ Strengths

- ~150 comprehensive E2E tests covering all major features
- Screenshots for both light/dark themes across all views
- Tests for edge cases (empty title, special characters, malformed import)
- CI/CD pipeline with artifact upload on failure
- `clearStorage` helper for test isolation

### ⚠️ Gaps

| # | Gap | Impact |
|---|-----|--------|
| 1 | ~~No unit tests~~ — 66 Vitest cases across `tests/unit/{date,issue}-helpers.test.ts`, `markdown.test.ts`, `security.test.ts`. The markdown parser, `isSafeUrl`, date helpers, and issue helpers now have direct coverage. The calendar helpers and dependency-cycle detection are still uncovered. | Resolved (partial — see scope reduction) |
| 2 | No visual regression testing — screenshots are manually captured, not diffed. | Medium |
| 3 | `waitForTimeout()` used in tests — flaky timing instead of proper assertions (e.g., `page.locator('.toast').waitFor()`). | Medium |
| 4 | `file://` protocol limitations — tests use `file://` which may block localStorage in some browsers. The try/catch silence is a concern. | Low |
| 5 | No mobile viewport tests — only screenshots, no functional tests at 375px. | Low |
| 6 | No stress tests — no tests for 100+ issues, large imports, or rapid state changes. | Medium |

---

## 7. CSS Review

### ✅ Strengths

- Well-organized CSS custom properties with light/dark theme separation
- Consistent naming convention (`--component-element-state`)
- Good responsive breakpoints (1200px, 768px)
- `.issue-card[data-type="..."]` type-based left border is a nice visual touch

### ⚠️ Issues

| # | Issue | Severity |
|---|-------|----------|
| 1 | ~200 dark-mode overrides (`[data-theme="dark"]`) — these should be consolidated or eliminated by using CSS custom properties consistently. Many overrides re-declare values that should already be themed via variables. | Medium |
| 2 | Inline styles in JS — column-menu, toast, markdown-help-tooltip all have hardcoded `style.cssText` — not theme-aware, not maintainable. | Medium |
| 3 | `--text-muted` is `#8A7568` in light theme — this is the value used across the app and fails WCAG AA. | **High** |
| 4 | `--primary` button text — coral `#DB8C61` on white has ~3.8:1 contrast, failing WCAG AA for small text. | Medium |
| 5 | `#sidebar-wrapper.collapsed` uses `!important` — fragile, hard to override. | Low |
| 6 | `app-layout:has(.detail-panel.open)` — uses `:has()` selector which isn't supported in Safari < 15.4. | Low |

---

## 8. Summary of Issues by Priority

### Critical (fix immediately)

| # | Issue | File | Impact |
|---|-------|------|--------|
| C1 | LJ global + 16 alias variables — massive global pollution | `state.js` | Maintainability, collision risk |
| C2 | main.js God function — 300+ lines of mixed concerns | `main.js` | Unmaintainable |
| C3 | Duplicate `renderCalendarView()` / `renderCalendar()` | `render.js` | Code bloat, bug risk |
| C4 (resolved) | ~~No unit tests~~ — 66 Vitest cases across 4 files (`tests/unit/`) | `tests/unit/` | Regression risk for the new helpers is now bounded; core logic helpers (date, markdown, security, issue) have direct coverage |

### High (fix soon)

| # | Issue | File | Impact |
|---|-------|------|--------|
| H1 | events.js is 500+ lines mixing DOM + business logic | `events.js` | Hard to test/maintain |
| H2 | `saveState()` called synchronously too often | Multiple | Performance on bulk ops |
| H3 | `--text-muted` fails WCAG AA (~2.8:1) | `styles.css` | Accessibility |
| H4 | No CSP header/meta | `index.html` | XSS surface |
| H5 | `initDragDrop()` clones all column-bodies every render | `events.js` | DOM thrashing |

### Medium (fix when convenient)

| # | Issue | Impact |
|---|-------|--------|
| M1 | Magic numbers throughout codebase | Readability |
| M2 | Dead functions (`undoDeleteIssue`, `undoMoveIssue`, `renderCalendar`) | Code bloat |
| M3 | No memoization of filtered results | Performance |
| M4 | ~200 dark-mode CSS overrides | Maintainability |
| M5 | Inline styles in JS for dynamic elements | Theming, consistency |
| M6 | `prompt()` used for UX-critical input | UX |

### Low (nice to have)

| # | Issue | Impact |
|---|-------|--------|
| L1 | ~~No TypeScript~~ — done in `.plan/plan-003-typescript-migration.md` | ~~Type safety~~ resolved |
| L2 | No JSDoc | IDE support |
| L3 | No virtual scrolling | Performance at scale |
| L4 | No Web Vitals monitoring | Performance observability |
| L5 | No mobile functional tests | Regression risk |

---

## 9. Recommendations — Prioritized Action Plan

The prioritized plan in `docs/prioritized-fix-plan.md` predates the TypeScript migration. Items it lists that the migration resolved:

- **C1 (TypeScript migration for type safety)** — done (`.plan/plan-003-typescript-migration.md`).
- **C4 (No unit tests)** — partially done; the new `tests/unit/*.test.ts` files cover the helpers, but ~236 Playwright specs still carry the bulk of regression coverage.
- **Add GitHub Actions CI for test automation** — done (`.github/workflows/test.yml`).

Items the migration marked as out of scope (follow-ups in the migration plan §10):

- ~~**Remove the `attach()` indirection** in `src/_attach.ts`~~ — **done** (PR #19 / branch `chore/remove-attach-indirection`, 2026-06-15). `src/_attach.ts` deleted; all 27 client `.ts` files now use real `import` statements. `window.storage` exposure in `src/storage.ts` preserved for the storage-browser test contract. `LJ_CONSTANTS` augmentation in `src/global.d.ts` removed (no remaining consumers). **Follow-up (same PR):** the Playwright `page.evaluate()` callback in `tests/tests.spec.mjs` runs in a fresh global scope with no module graph, so a narrow `window.getIssues` / `window.getCurrentProject` / `window.switchProject` test-contract re-exposure was added at the bottom of `src/state.ts` and `src/render.ts` (mirroring the existing `window.storage` and `window.__jiritoHasPendingSave` shims). Real consumers continue to use real `import` statements — this is *not* a revival of the classic-script global.
- ~~**Audit `src/main-*.ts` for ambient-vs-actual mismatches**~~ — **done** (same PR). Replaced the legacy `declare const storage: StorageLayer` ambient in `state.ts` with a real `import { storage } from "./storage.js"`. Removed the redundant `typeof storage !== "undefined"` defensive check. Removed the pre-existing duplicate listeners in `main-filter-controls.ts` (search-input, filter-type, filter-priority, filter-assignee) — `main-filters.ts` already wires them. Cleaned up unused `CustomColumn` / `Project` type imports in `events.ts` / `data.ts`. Replaced inline `import("./types").X` casts with named type imports.
- **Replace the `LJ` global state** with a typed store.
- **Schema validation** at server boundaries (e.g. with `zod`).
- **Convert Playwright specs to TypeScript** (currently `.mjs`).
- **Bundle the client** for production (currently per-module emits).

The remaining priorities in the original action plan (C2, C3, H1–H5, M1–M6) are unchanged. See `docs/prioritized-fix-plan.md` for the full list.
