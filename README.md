# Jirito 🟢

> A Kanban board application — the client runs entirely in the browser with zero runtime dependencies; the optional Node/Express server adds SQLite persistence via `sql.js`.

![Jirito Logo](public/jirito_logo.png)

## ✨ Features

### Views
- **Board** — Classic Kanban board with drag-and-drop columns
- **List** — Table-style issue listing with sorting and filtering
- **Calendar** — Visual calendar view for issue due dates
- **Dashboard** — Overdue issues, stats, and project overview

### Capabilities
- 🖱️ **Drag & Drop** — Move issues between columns and reorder with intuitive drag-and-drop
- 📂 **Projects** — Organize issues across multiple projects
- 🏷️ **Filters** — Filter by assignee, status, priority, and custom fields
- 🔀 **Sprints** — Plan and track work in sprints
- 📝 **Comments** — Add comments and activity feeds to issues
- 🔍 **Search** — Full-text search across all issues
- ⚡ **Bulk Actions** — Select and modify multiple issues at once
- 🌙 **Dark Mode** — Toggle between warm beige light and GitHub-dark inspired themes
- 📱 **Responsive** — Mobile-friendly layout
- 🔒 **Offline** — Everything runs locally via `localStorage` — falls back gracefully when server is unavailable
- 📤 **Import/Export** — JSON import/export for data portability

## 📸 Screenshots

### Board View
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Board](screenshots/01-light-board.png) | ![Dark Board](screenshots/17-dark-board.png) |
| *Classic Kanban board with drag-and-drop columns* | *GitHub-dark inspired theme* |

### List View
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light List](screenshots/04-light-list-view.png) | ![Dark List](screenshots/20-dark-list-view.png) |
| *Table-style listing with sorting and filtering* | *Dark mode list view* |

### Calendar View
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Calendar](screenshots/10-light-calendar.png) | ![Dark Calendar](screenshots/26-dark-calendar.png) |
| *Visual calendar for issue due dates* | *Dark mode calendar* |

### Dashboard View
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Dashboard](screenshots/11-light-dashboard.png) | ![Dark Dashboard](screenshots/27-dark-dashboard.png) |
| *Overdue issues, stats, and project overview* | *Dark mode dashboard* |

### Detail Panel
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Detail](screenshots/02-light-detail-panel.png) | ![Dark Detail](screenshots/18-dark-detail-panel.png) |
| *Rich issue detail with comments and activity feed* | *Dark mode detail panel* |

### Create Issue Modal
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Create](screenshots/03-light-create-modal.png) | ![Dark Create](screenshots/19-dark-create-modal.png) |
| *Create new issues with custom fields and metadata* | *Dark mode create modal* |

### Filters
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Filters](screenshots/05-light-filters.png) | ![Dark Filters](screenshots/21-dark-filters.png) |
| *Advanced filters by assignee, status, priority* | *Dark mode filters* |

### Search
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Search](screenshots/06-light-search.png) | ![Dark Search](screenshots/22-dark-search.png) |
| *Full-text search across all issues* | *Dark mode search* |

### Sidebar Navigation
| Light (Open) | Light (Collapsed) | Dark (Open) | Dark (Collapsed) |
|--------------|-------------------|-------------|------------------|
| ![Sidebar Open](screenshots/07-light-sidebar-open.png) | ![Sidebar Collapsed](screenshots/08-light-sidebar-collapsed.png) | ![Dark Open](screenshots/23-dark-sidebar-open.png) | ![Dark Collapsed](screenshots/24-dark-sidebar-collapsed.png) |

### Notifications
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Notifications](screenshots/09-light-notifications.png) | ![Dark Notifications](screenshots/25-dark-notifications.png) |
| *Overdue issues notification dropdown* | *Dark mode notifications* |

### Activity Feed
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Activity](screenshots/13-light-activity-feed.png) | ![Dark Activity](screenshots/29-dark-activity-feed.png) |
| *Issue activity feed (light)* | *Issue activity feed (dark)* |

### Bulk Actions
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Bulk](screenshots/12-light-drag-preview.png) | ![Dark Bulk](screenshots/28-dark-bulk-action.png) |
| *Multi-issue selection and bulk operations* | *Dark mode bulk actions* |

### New Project Modal
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light New Project](screenshots/14-light-new-project.png) | ![Dark New Project](screenshots/30-dark-new-project.png) |
| *Create new project (light)* | *Create new project (dark)* |

### Overdue Detail
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Overdue](screenshots/15-light-overdue-detail.png) | ![Dark Overdue](screenshots/31-dark-overdue-detail.png) |
| *Overdue issue detail (light)* | *Overdue issue detail (dark)* |

### Mobile Responsive
| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Mobile](screenshots/16-light-mobile.png) | ![Dark Mobile](screenshots/32-dark-mobile.png) |
| *Responsive layout on mobile (light)* | *Responsive layout on mobile (dark)* |

## 🛠️ Tech Stack

| Aspect | Details |
|--------|---------|
| **Type** | TypeScript SPA with optional Node `http` server |
| **Language** | TypeScript (ES2022, strict) — emitted `.js` artifacts are committed alongside the `.ts` sources |
| **Styling** | CSS (light + dark themes) |
| **Icons** | [Phosphor Icons](https://phosphoricons.com/) (CDN, CSS-only, font-based). The `lucideIcon()` helper in `src/utils.ts` is a legacy name from a pre-Phosphor era — it emits `<i class="ph ph-…">` Phosphor markup. |
| **Storage** | `localStorage` (1 state blob + 4 UI keys) + optional SQLite via `sql.js` (server). When the server is reachable, data round-trips through `/api/*` and is mirrored to `localStorage` for fast re-hydration and offline fallback. |
| **Testing** | Playwright (236 E2E tests) + Vitest (66 unit tests) |
| **Formatting** | ESLint + Prettier (configured; ESLint is not currently wired to a CI step) |
| **CI** | GitHub Actions (`test.yml`) — `npm run typecheck` then Playwright |

## 🚀 Getting Started

### Prerequisites
- Any modern browser (Chrome, Firefox, Safari, Edge)
- No server or backend required

### Quick Start
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/jirito.git
   cd jirito
   ```
2. Open `index.html` in your browser directly, or serve with any static server:
   ```bash
   # Using Python
   python3 -m http.server 8080
   # Using Node
   npx serve .
   ```

# Or with the built-in backend server (SQLite + static file serving on a single port)
   ```bash
   npm run dev     # http://localhost:3001 — uses tsx, no build step needed
   # or
   npm run build && npm run server  # http://localhost:3001 — built artifacts
   ```
   The single backend process serves both the static client (`/`, `/src/*.js`,
   `/styles.css`, `/public/*`, …) and the `/api/*` routes. Same-origin, so the
   browser can call the API without CORS.
3. Start tracking your projects! 🎉

### Building

Jirito's client and server are written in TypeScript. `tsc` emits ES modules next to the `.ts` sources (`src/*.ts` → `src/*.js`); the server is also emitted to `dist/server/`. Both are committed alongside the sources so the app runs without a build step in development.

```bash
npm install
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b (emit src/*.js + dist/server/**)
```

The Playwright E2E tests launch the server via `npx tsx server/index.ts` (the `tsx` runtime), so they do not require a prior `npm run build`. `npm run server` instead serves the emitted `dist/server/index.js`.

### Running with Backend

Jirito's Node server (built on the standard `node:http` module — no framework) is a single process that serves both the static
client and the `/api/*` REST routes. There is no separate static server to run.

1. Start the backend (which also serves the app):
   ```bash
   npm run dev
   # → http://localhost:3001
   ```
   The server runs on port **3001** by default. Configure with `SERVER_PORT` env var.
   Database is stored at `./jirito.db` by default (`JIRITO_DB_PATH` env var).

2. Open **http://localhost:3001** in your browser. The frontend auto-detects the
   server via a health check at `/api/health` and uses SQLite persistence.

3. Data syncs to SQLite when the server is available. When the server is
   unavailable, the app falls back to `localStorage` — no data loss.

> **Note**: The frontend and backend are designed to be same-origin. If you
> serve the static files from a different origin (e.g. `npx serve .` on
> port 8080), set `VITE_API_URL` to point the client at the backend.

### Running Tests

```bash
npm test            # Playwright E2E suite (236 tests; launches the server via tsx)
npm run test:unit   # Vitest unit suite (66 tests across 4 files in tests/unit/)
npm run typecheck   # tsc -b --noEmit; the first step in CI
```

The Playwright suite requires a Chromium browser (`npx playwright install --with-deps chromium`); the Vitest unit suite has no such dependency.

## 📁 Project Structure

```
jirito/
├── index.html              # Single-page application entry (CSP, Phosphor CDN link)
├── styles.css              # All styles (light + dark themes)
├── public/
│   └── jirito_logo.png     # Project logo
├── src/                    # Client (29 .ts modules + 2 .d.ts; emitted .js committed)
│   ├── types.ts            # Canonical data model (Issue, Project, Sprint, …)
│   ├── constants.ts        # Typed CONSTANTS object (replaces legacy LJ_CONSTANTS)
│   ├── global.d.ts         # Ambient Window augmentation (test contracts)
│   ├── state.ts            # Module-scoped state + typed getters/setters
│   ├── storage.ts          # localStorage sync + server REST mirror (`window.storage` test contract)
│   ├── render.ts           # Board / list / calendar / dashboard / sidebar rendering
│   ├── events.ts           # DOM event wiring (drag-drop, keyboard, etc.)
│   ├── data.ts             # Import/export + sample data
│   ├── utils.ts            # Markdown, date, icon, helper utilities
│   ├── api.ts              # REST client (thin wrapper around fetch)
│   ├── main.ts             # Application bootstrap (DOMContentLoaded orchestrator)
│   └── main-*.ts           # 19 focused bootstrap modules (theme, sprints, filters, …)
├── server/                 # Node http server (17 .ts modules; emitted to dist/server/ at build)
│   ├── index.ts            # HTTP entry — same process serves static + /api/*
│   ├── static.ts           # Static file serving (no framework)
│   ├── webhooks.ts         # Webhook delivery (outbox + bridge)
│   ├── _types-shim.ts      # Re-exports client types for the server
│   ├── db/
│   │   ├── index.ts        # sql.js wrapper
│   │   └── init.ts         # CREATE TABLE + idempotent migrations
│   └── routes/             # 11 REST route modules (issues, projects, sprints, …)
├── tests/                  # Playwright E2E specs (.spec.mjs) + Vitest unit tests (tests/unit/*.test.ts)
├── playwright/             # Playwright config + global setup/teardown + shared helpers
├── screenshots/            # Light + dark screenshots for every view
├── docs/                   # Project study, code review, fix plans
├── .github/
│   └── workflows/
│       └── test.yml        # GitHub Actions CI (typecheck + Playwright)
├── tsconfig.json           # Solution file referencing the 3 sub-projects
├── tsconfig.client.json    # Client tsconfig (DOM lib, outDir = src)
├── tsconfig.server.json    # Server tsconfig (Node lib, outDir = dist/server)
├── tsconfig.tests.json     # Vitest tsconfig (DOM + src rootDirs)
├── vitest.config.ts        # Vitest config
├── .eslintrc.json          # ESLint config (not currently wired to a CI step)
├── .prettierrc             # Prettier config
├── package.json
├── package-lock.json
└── tsconfig.*.tsbuildinfo  # TS incremental build cache
```

## 📦 Dependencies

The honest version of the dependency story:

| Layer | Runtime deps | Dev / build deps |
|---|---|---|
| **Browser (the `src/*.js` files loaded by `index.html`)** | **0** — the client never imports anything from `node_modules` | — |
| **Node server** | `sql.js` (1) — for SQLite | — |
| **Build / test tooling** | — | `typescript`, `tsx`, `vitest`, `jsdom`, `@playwright/test`, `playwright`, `@types/node` (7 direct, ~76 transitive) |

So `npm install` brings ~76 packages, but **none of them are ever shipped to the browser**. The "zero runtime dependencies" claim was always about the client; it remains true.

## 🗄️ Data Model

### Client (`localStorage`)

The client uses **one state blob** (`jirito-state`) that contains the entire app state as JSON, plus four small UI / preference keys. The state shape is declared in `src/types.ts` (`AppState`).

| Key | Shape | Notes |
|-----|-------|-------|
| `jirito-state` | `AppState` (JSON) | Holds `issues`, `comments`, `projects`, `currentProject`, `savedFilters`, `activity`, `activityLog`, `issueCounter`, `trash`, `sprints`, `columns`, `customColumns` — the whole app. |
| `jirito-theme` | `"light" \| "dark"` | User's theme preference (mirrored to `data-theme` on `<html>`). |
| `jirito-onboarding` | `"true"` | Set after the onboarding wizard is dismissed. |
| `listview-sort` | column key (e.g. `"key"`) | List view sort column. |
| `listview-dir` | `"asc" \| "desc"` | List view sort direction. |

When the server is reachable, the same `AppState` shape round-trips through `/api/state` and is persisted in SQLite. The localStorage copy is a fast-rehydration cache and offline fallback — `src/storage.ts` keeps the two in sync.

### Server (SQLite)

`server/db/init.ts` creates the tables; `server/db/index.ts` wraps `sql.js`. Schema highlights:

- `issues` — main table; `customColumnId` was added in a migration.
- `comments` — keyed by issue id.
- `projects`, `sprints`, `activity` — supplementary tables.
- `webhook_outbox` — durable retry queue for the optional webhook bridge (see `server/webhooks.ts`).

> ⚠️ **No runtime schema validation** at server boundaries yet — the TypeScript types are compile-time only. Adding `zod` (or similar) to the request handlers is a follow-up (see the Roadmap below).

## 🔒 Security Notes

- **No authentication** — this is a personal/localhost tool. The server has no auth layer; do not expose it beyond `127.0.0.1` without adding one.
- **Plain-text localStorage / SQLite** — do not store sensitive data. Both layers store the same `AppState` JSON; nothing is encrypted at rest.
- **Markdown XSS — mitigated.** `isSafeUrl()` in `src/utils.ts` allowlists URL schemes (`http:`, `https:`, `mailto:`, `tel:`); `javascript:`, `data:`, `vbscript:` and unknown schemes are dropped. The `tests/unit/security.test.js` suite (18 cases) locks this in.
- **Content Security Policy — present.** `index.html` ships a strict CSP: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline' https://unpkg.com`; `img-src 'self' data: blob:`; `font-src https://unpkg.com`; `connect-src 'self'`. The `unsafe-inline` on styles is required by Phosphor's font-based icon CSS.
- **No runtime schema validation** — request payloads are trusted to match the `AppState` TypeScript shape. Adding `zod` to `server/routes/*.ts` is a follow-up.

## 📊 Stats

| Metric | Value |
|--------|-------|
| TypeScript modules | 30 in `src/` (29 source + `global.d.ts`) + 17 in `server/` = **47 total** |
| Hand-written source lines | ~9,100 client + ~5,500 test specs = **~14,500** (excludes generated `.js` and `.js.map` artifacts) |
| E2E Tests | **236** (Playwright, `tests/*.spec.mjs`) |
| Unit Tests | **66** (Vitest, `tests/unit/*.test.ts`) |
| Browser Runtime Deps | **0** (the client has no imports from `node_modules`; all assets are served from `index.html` / `styles.css` / `src/*.js`) |
| Build artifacts | `src/*.js` and `dist/server/**` are emitted by `tsc -b` and committed |

## 🧭 Roadmap

### ✅ Done
- [x] ESLint + Prettier configuration (lock in formatting)
- [x] `package-lock.json` committed (reproducible installs)
- [x] Markdown XSS mitigation (URL scheme allowlist in `isSafeUrl`)
- [x] `saveState()` debouncing + `saveStateImmediate()` for bulk operations
- [x] GitHub Actions CI (`typecheck` + Playwright)
- [x] TypeScript migration — all 47 client + server modules are `.ts`; emitted `.js` artifacts committed; strict mode on. Landed across PRs #17, #18, #19.
- [x] `attach()` indirection removed — the `src/_attach.ts` shim that bridged ES-module exports to classic-script `window` callers is gone (PR #19).
- [x] Content Security Policy in `index.html`

### 🔜 Next (Tier 1 + 2)

- [ ] **Deduplicate the static server** — `playwright/playwright-global-setup.mjs` and `server/static.ts` both serve the same files; the Playwright harness should hit port 3001 like everything else.
- [ ] **Replace the `LJ` global with a typed store** — the migration left the `LJ` namespace in place as legacy state; a singleton class with `getState()` / `setState(patch)` / `subscribe(listener)` is the next refactor. See `docs/code-review.md` for the full motivation.
- [ ] **Add runtime schema validation at server boundaries** (`zod` or `valibot`) — the TypeScript types are compile-time only; runtime guards would catch malformed input.
- [ ] **Wire ESLint into CI** — config exists in `.eslintrc.json`; no `lint` script and no CI step runs it.
- [ ] **Add virtual scrolling** for boards / lists with 100+ issues.

### 🌱 Stretch (Tier 3)

- [ ] **Convert Playwright specs to TypeScript** (~10 `.spec.mjs` files, ~5,400 LOC).
- [ ] **Bundle the client for production** — current emit is per-module (28 separate HTTP requests on first load). A `tsc + esbuild --bundle` step would give a single hashed file.
- [ ] **JSDoc → TSDoc sweep** for the legacy comments.
- [ ] **Extract duplicated `renderDashboard` code** (code review C3).
- [ ] **Add Web Vitals monitoring.**
- [ ] **Implement optional PIN/password lock.**

## 🤝 Contributing

Contributions are welcome! Areas of particular interest:

1. **Code Quality** — Refactor global state, add JSDoc, eliminate magic numbers
2. **Testing** — Add unit tests alongside existing E2E suite
3. **Security** — Input sanitization, CSP headers
4. **Performance** — Virtual scrolling, memoized filtering, debounced saves
5. **Accessibility** — Improve contrast ratios, keyboard navigation

## 📄 License

MIT

---

*Built with TypeScript and CSS. No browser frameworks; no runtime dependencies shipped to the client.* 🏗️
