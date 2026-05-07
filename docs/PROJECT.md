# Project Study: jira-clone (Jirito)

### Executive Summary
A **fully client-side Kanban board** ("Jirito") with localStorage persistence, built with vanilla JS/CSS, no backend, and ~150 Playwright E2E tests. Single-developer project with functional UI but significant room for improvement in code quality, security, and testing.

---

### Technical Architecture
| Aspect | Status |
|--------|--------|
| Type | Vanilla JS SPA (no build step) |
| Modules | 6 JS files: state, render, events, data, utils, main |
| State | `LJ` namespace + localStorage sync |
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
| E2E Tests | ✅ ~150 Playwright tests |
| Unit Tests | ❌ None |
| Linting | ❌ None |
| CI/CD | ❌ Not configured |

### Dependencies
- **Runtime**: None (pure HTML/JS/CSS)
- **Dev**: `@playwright/test` + `playwright` 1.59.1
- ⚠️ **No lock file** — reproducibility not guaranteed

### Code Quality
- 5,198 lines across 7 files
- Global state mutation (`LJ.*`), magic numbers, inconsistent formatting
- No TypeScript, no JSDoc, no types
- Duplicate `renderDashboard` functions

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
5. Consider TypeScript migration for type safety
6. Replace `LJ` global with proper state management
7. Add virtual scrolling for 100+ issues
8. Add GitHub Actions CI for test automation

**Low Priority:**
9. Extract duplicated `renderDashboard` code
10. Add Web Vitals monitoring
11. Implement optional PIN/password lock

---

### Failed/NOT Covered Areas
- No backend/API investigation (none exists)
- No containerization (not applicable)
- No monitoring setup (none configured)
