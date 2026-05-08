# Jirito 🟢

> A fully client-side Kanban board application — your personal project tracker, running entirely in the browser with **zero backend**.

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
- 🔒 **Offline** — Everything runs locally via `localStorage` — no server needed
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
| **Type** | Vanilla JS SPA (no build step) |
| **Language** | JavaScript (ES Modules) |
| **Styling** | CSS (light + dark themes) |
| **Icons** | Lucide (CDN) |
| **Storage** | `localStorage` (9 keys) |
| **Testing** | Playwright (~150 E2E tests) |
| **Formatting** | ESLint + Prettier |
| **CI** | GitHub Actions (`test.yml`) |

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
3. Start tracking your projects! 🎉

### Running Tests
```bash
npm test
```

## 📁 Project Structure

```
jirito/
├── index.html              # Single-page application entry
├── styles.css              # All styles (light + dark themes)
├── public/
│   └── jirito_logo.png     # Project logo
├── src/
│   ├── state.js            # State management (LJ namespace) + localStorage sync
│   ├── render.js           # DOM rendering functions
│   ├── events.js           # Event handlers
│   ├── data.js             # Import/export data operations
│   ├── utils.js            # Utility functions
│   └── main.js             # Application bootstrap
├── tests/                  # Playwright E2E tests (~150 tests)
├── screenshots/            # Application screenshots
├── docs/
│   └── PROJECT.md          # Project study document
├── playwright/
│   ├── playwright.config.mjs
│   └── playwright-global-setup.mjs
├── .github/
│   └── workflows/
│       └── test.yml        # GitHub Actions CI
├── .eslintrc.json          # ESLint configuration
├── .prettierrc             # Prettier configuration
├── package.json
└── package-lock.json
```

## 🗄️ Data Model

Jirito stores data in `localStorage` under 9 keys:

| Key | Content |
|-----|---------|
| `jirito-issues` | Issue objects (title, status, assignee, priority, due date, etc.) |
| `jirito-comments` | Issue comments |
| `jirito-projects` | Project definitions |
| `jirito-currentProject` | Currently selected project |
| `jirito-savedFilters` | Saved filter configurations |
| `jirito-activity` | Activity log |
| `jirito-trash` | Soft-deleted issues |
| `jirito-sprints` | Sprint data |
| `jirito-customColumns` | Custom column configurations |

> ⚠️ **No schema validation or transactions** — data is stored as plain JSON.

## 🔒 Security Notes

- **No authentication** — this is a personal, offline tool
- **Plain-text localStorage** — do not store sensitive data
- **Markdown rendering** — `javascript:` URLs are a potential XSS vector; consider sanitizing user input
- **No Content Security Policy** — consider adding one for production use

## 📊 Stats

| Metric | Value |
|--------|-------|
| Total Lines | ~5,600 |
| Source Files | 7 (index.html, styles.css, 6 JS modules) |
| E2E Tests | ~150 |
| Unit Tests | None |
| Dependencies | `@playwright/test` (dev only) |

## 🧭 Roadmap

### High Priority
- [x] Add ESLint + Prettier (lock in formatting) ✅
- [x] Add lock file (`package-lock.json`) ✅
- [x] Fix markdown XSS (block `javascript:` URLs) ✅
- [x] Add `saveState()` debouncing for bulk operations ✅

### Medium Priority
- [ ] TypeScript migration for type safety
- [ ] Replace `LJ` global with proper state management
- [ ] Add virtual scrolling for 100+ issues
- [x] Add GitHub Actions CI for test automation ✅

### Low Priority
- [ ] Extract duplicated `renderDashboard` code
- [ ] Add Web Vitals monitoring
- [ ] Implement optional PIN/password lock

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

*Built with vanilla JS, CSS, and love. No frameworks harmed in the making.* 🏗️
