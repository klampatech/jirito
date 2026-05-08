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
![Light Board View](screenshots/01-light-board.png)
*Classic Kanban board with drag-and-drop columns*

### Detail Panel
![Light Detail Panel](screenshots/02-light-detail-panel.png)
*Rich issue detail panel with comments and activity feed*

### Create Issue Modal
![Create Issue](screenshots/03-light-create-modal.png)
*Create new issues with custom fields and metadata*

### List View
![Light List View](screenshots/04-light-list-view.png)
*Table-style listing with sorting and filtering*

### Filters
![Filters](screenshots/05-light-filters.png)
*Advanced filters by assignee, status, priority, and more*

### Search
![Search Results](screenshots/06-light-search.png)
*Full-text search across all issues*

### Sidebar Navigation
| Expanded | Collapsed |
|----------|-----------|
| ![Sidebar Open](screenshots/07-light-sidebar-collapsed.png) | ![Sidebar Closed](screenshots/13-dark-sidebar-collapsed.png) |
| *Collapsible sidebar navigation* | *Compact mode for more screen space* |

### Notifications
| Light | Dark |
|-------|------|
| ![Light Notifications](screenshots/08-light-notifications.png) | ![Dark Activity Feed](screenshots/18-dark-activity-feed.png) |
| *Notification dropdown* | *Activity feed (dark mode)* |

### Dark Mode
| Light | Dark |
|-------|------|
| ![Light Board](screenshots/01-light-board.png) | ![Dark Board](screenshots/09-dark-board.png) |
| *Warm beige light theme* | *GitHub-dark inspired* |

### Mobile
| Light | Dark |
|-------|------|
| ![Light Mobile](screenshots/19-light-mobile.png) | ![Dark Mobile](screenshots/20-dark-mobile.png) |
| *Responsive on mobile* | *Dark mode on mobile* |

### Additional Views
| Feature | Preview |
|---------|---------|
| Detail Panel (Dark) | ![Dark Detail](screenshots/10-dark-detail-panel.png) |
| Create Modal (Dark) | ![Dark Create](screenshots/11-dark-create-modal.png) |
| List View (Dark) | ![Dark List](screenshots/12-dark-list-view.png) |
| Collapsed Sidebar | ![Collapsed](screenshots/13-dark-sidebar-collapsed.png) |
| Bulk Actions | ![Bulk Actions](screenshots/14-dark-bulk-action.png) |
| Column Menu | ![Column Menu](screenshots/15-dark-column-menu.png) |
| Drag Preview | ![Drag Preview](screenshots/16-light-drag-preview.png) |
| Activity Feed (Light) | ![Activity Feed](screenshots/17-light-activity-feed.png) |
| Activity Feed (Dark) | ![Activity Feed Dark](screenshots/18-dark-activity-feed.png) |
| New Project Modal (Light) | ![New Project Light](screenshots/21-light-new-project-modal.png) |
| New Project Modal (Dark) | ![New Project Dark](screenshots/22-dark-new-project-modal.png) |
| Overdue Detail (Light) | ![Overdue Light](screenshots/23-light-overdue-detail.png) |
| Overdue Detail (Dark) | ![Overdue Dark](screenshots/24-dark-overdue-detail.png) |

### Sidebar Views
| View | Light Preview | Dark Preview |
|------|-------------|-------------|
| Board | ![Board](screenshots/sidebar-views/01-board-view.png) | ![Dark Board](screenshots/sidebar-views/dark-board-view.png) |
| List | ![List](screenshots/sidebar-views/03-list-view.png) | ![Dark List](screenshots/sidebar-views/dark-list-view.png) |
| Calendar | ![Calendar](screenshots/sidebar-views/04-calendar-view.png) | ![Dark Calendar](screenshots/sidebar-views/dark-calendar-view.png) |
| Dashboard | ![Dashboard](screenshots/sidebar-views/05-dashboard-view.png) | ![Dark Dashboard](screenshots/sidebar-views/dark-dashboard-view.png) |

## 🛠️ Tech Stack

| Aspect | Details |
|--------|---------|
| **Type** | Vanilla JS SPA (no build step) |
| **Language** | JavaScript (ES Modules) |
| **Styling** | CSS (light + dark themes) |
| **Icons** | Lucide (CDN) |
| **Storage** | `localStorage` (8 keys) |
| **Testing** | Playwright (~150 E2E tests) |
| **Formatting** | ESLint + Prettier |

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
jira-clone/
├── index.html              # Single-page application entry
├── styles.css              # All styles (light + dark themes)
├── public/
│   └── jirito_logo.png     # Project logo
├── src/
│   ├── state.js            # State management (LJ namespace)
│   ├── render.js           # DOM rendering functions
│   ├── events.js           # Event handlers
│   ├── data.js             # Data layer / localStorage sync
│   ├── utils.js            # Utility functions
│   └── main.js             # Application bootstrap
├── tests/                  # Playwright E2E tests (~150 tests)
├── screenshots/            # Application screenshots
├── docs/
│   └── PROJECT.md          # Project study document
├── playwright/             # Playwright config
├── .eslintrc.json          # ESLint configuration
├── .prettierrc             # Prettier configuration
└── package.json
```

## 🗄️ Data Model

Jirito stores data in `localStorage` under 8 keys:

| Key | Content |
|-----|---------|
| `jirito-issues` | Issue objects (title, status, assignee, priority, due date, etc.) |
| `jirito-projects` | Project definitions |
| `jirito-comments` | Issue comments |
| `jirito-sprints` | Sprint data |
| `jirito-custom-columns` | Custom column configurations |
| `jirito-settings` | User preferences (theme, sidebar state, etc.) |
| `jirito-...` | Additional configuration keys |

> ⚠️ **No schema validation or transactions** — data is stored as plain JSON.

## 🔒 Security Notes

- **No authentication** — this is a personal, offline tool
- **Plain-text localStorage** — do not store sensitive data
- **Markdown rendering** — `javascript:` URLs are a potential XSS vector; consider sanitizing user input
- **No Content Security Policy** — consider adding one for production use

## 📊 Stats

| Metric | Value |
|--------|-------|
| Total Lines | ~5,200 |
| Source Files | 7 (index.html, styles.css, 6 JS modules) |
| E2E Tests | ~150 |
| Unit Tests | None |
| Dependencies | `@playwright/test` (dev only) |

## 🧭 Roadmap

### High Priority
- [ ] Add ESLint + Prettier (lock in formatting) ✅
- [ ] Add lock file (`package-lock.json`)
- [ ] Fix markdown XSS (block `javascript:` URLs)
- [ ] Add `saveState()` debouncing for bulk operations

### Medium Priority
- [ ] TypeScript migration for type safety
- [ ] Replace `LJ` global with proper state management
- [ ] Add virtual scrolling for 100+ issues
- [ ] Add GitHub Actions CI for test automation

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
