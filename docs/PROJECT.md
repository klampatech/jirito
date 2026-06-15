# Project Study: jira-clone (Jirito)

### Executive Summary
A **fully client-side Kanban board** ("Jirito") with localStorage persistence, built with vanilla JS/CSS, no backend, and ~150 Playwright E2E tests. Single-developer project with functional UI but significant room for improvement in code quality, security, and testing.

---

### Technical Architecture
| Aspect | Status |
|--------|--------|
| Type | TypeScript SPA (strict, ES2022) with optional Express-style Node server |
| Modules | 36 `.ts` files in `src/` + 15 in `server/`; emitted `.js` and `dist/server/**` are committed and run unchanged |
| State | `LJ` namespace (legacy) + localStorage sync; per-file ES-module exports (the `attach()` indirection was removed in PR #19; cleanup of the `LJ` namespace itself is a follow-up) |
| Icons | Lucide (CDN) |
| Rendering | DOM manipulation (no framework) |

### Data & Storage
- **localStorage** only — 8 keys (`jirito-issues`, `jirito-projects`, etc.)
- Entities: Issue, Project, Comment, Sprint, CustomColumn
- No schema validation, no transactions, no backup

### API & Integrations
- **None** — zero network calls (pure offline SPA)
- Import/Export JSON is the only data portability

### Security
⚠️ **Critical gaps**: No auth, plain-text localStorage, potential XSS via markdown `javascript:` URLs, no CSP

### Testing & Quality
| | |
|--|--|
| E2E Tests | ✅ ~236 Playwright tests (run via `tsx` against the TypeScript server) |
| Unit Tests | ✅ 66 Vitest cases across 4 files (`tests/unit/`) |
| Linting | ✅ ESLint configured (status of integration not re-audited here) |
| CI/CD | ✅ GitHub Actions (`.github/workflows/test.yml`) — runs `typecheck` then Playwright |

### Dependencies
- **Runtime**: `sql.js` (server-side SQLite; the client has zero runtime deps)
- **Dev**: `@playwright/test` + `playwright` 1.59.1, `vitest`, `typescript`, `tsx`, `@types/node`, `jsdom`, `sql.js`
- ✅ `package-lock.json` committed; lockfile is the source of truth for reproducible installs

### Code Quality
- ~9,000 lines across the TypeScript source set (client + server) plus the Playwright spec set
- Strict TypeScript across the entire codebase; canonical types in `src/types.ts`
- `LJ` global still present (legacy, preserved during migration); the `attach()` shim that bridged it to ES modules was removed in PR #19; the `LJ` namespace itself is a follow-up tracked in `docs/code-review.md`
- Magic numbers, duplicate `renderDashboard` functions, and most other concerns from the original review remain

### User Experience
- **Views**: Board, List, Calendar, Dashboard
- **Features**: Drag-drop, sprints, filters, bulk actions, dark mode, onboarding
- **Themes**: Warm beige light / GitHub-dark inspired
- **Accessibility**: Partial — ARIA labels present, but contrast issues (#7A756E fails AA)

### Performance
⚠️ **Bottlenecks**:
- Full DOM rebuild on render (no virtual scrolling)
- Repeated filtering without memoization
- No debounced localStorage batching
- Calendar recomputes on every navigation

---

### Key Insights & Recommendations

**High Priority:**
1. Add ESLint + Prettier (lock in formatting)
2. Add a lock file (`npm install --package-lock-only`)
3. Fix markdown XSS (block `javascript:` URLs)
4. Add `saveState()` debouncing for bulk operations

**Medium Priority:**
5. ~~Consider TypeScript migration for type safety~~ — **done** (see `.plan/plan-003-typescript-migration.md`)
6. Replace `LJ` global with proper state management — partial progress (migration complete; the `attach()` shim that bridged classic-script callers to the new module graph was removed in PR #19; the `LJ` namespace itself is a follow-up tracked in `docs/code-review.md`)
7. Add virtual scrolling for 100+ issues
8. ~~Add GitHub Actions CI for test automation~~ — **done** (`.github/workflows/test.yml` runs `typecheck` + Playwright)

**Low Priority:**
9. Extract duplicated `renderDashboard` code
10. Add Web Vitals monitoring
11. Implement optional PIN/password lock

---

### Failed/NOT Covered Areas
- No backend/API investigation (none exists)
- No containerization (not applicable)
- No monitoring setup (none configured)
