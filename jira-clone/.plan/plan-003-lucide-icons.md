# Plan: Replace Emojis with Lucide Icons

## Overview
Replace emoji icons throughout the Jirito app with Lucide (MIT licensed, 1600+ SVG icons) via CDN. This improves visual consistency, accessibility, and professional appearance while keeping the project as a simple vanilla HTML/CSS/JS app.

## Approach
- Add Lucide via CDN script tag in `index.html` (`<script src="https://unpkg.com/lucide-static@latest/dist/umd/lucide.min.js">`)
- Use `lucide.createIcons()` to replace `<i data-lucide="icon-name"></i>` elements
- Create a helper function `icon(name, attrs)` that returns an `<i data-lucide="name">` element (or inline SVG) for use in template strings
- Replace emojis **where it makes sense** — not everything is an icon (e.g., onboarding illustrations, decorative elements)

## Emoji → Lucide Icon Mapping

### Issue Type Icons (cards, list view, detail panel)
| Emoji | Lucide Icon | Where Used |
|-------|------------|------------|
| 📖 (story) | `file-text` | createCard(), renderListView(), detail panel |
| 🐛 (bug) | `bug` | createCard(), renderListView(), detail panel |
| ✅ (task) | `check-square` | createCard(), renderListView(), detail panel |
| 🏔️ (epic) | `mountain` | createCard(), renderListView(), detail panel |
| 📄 (default) | `file` | fallback everywhere |

### UI / Navigation Icons
| Emoji | Lucide Icon | Where Used |
|-------|------------|------------|
| 📋 (logo) | `clipboard-list` | index.html logo |
| 🔔 (notifications) | `bell` | index.html notification bell |
| 🌙/☀️ (theme toggle) | `moon`/`sun` | index.html + main.js toggle logic |
| ☰ (sidebar toggle) | `panel-left` | index.html sidebar button |
| 📥 (export) | `download` | index.html export button |
| 📤 (import) | `upload` | index.html import button |
| 💾 (save filter) | `save` | index.html save filter button |
| 🗑 (delete) | `trash-2` | index.html delete buttons |
| 📋 (clone) | `copy` | index.html clone button |
| ➕ (create/add) | `plus` | index.html create button |
| ✕ (close/cancel) | `x` | column menu close |
| ✏️ (rename) | `pencil` | column menu rename |
| ➕ (add card) | `plus` | column menu add card |
| 🗑 (clear all) | `trash-2` | column menu clear |

### Activity / State Icons
| Emoji | Lucide Icon | Where Used |
|-------|------------|------------|
| ➕ (create activity) | `plus-circle` | main.js create activity |
| 🗑 (delete activity) | `trash-2` | main.js delete activity |
| ✏️ (rename activity) | `pencil` | main.js rename activity |
| 📥 (export activity) | `download` | data.js export activity |
| 📤 (import activity) | `upload` | data.js import activity |
| 🆕 (new project activity) | `sparkles` | data.js createProject activity |

### Other
| Emoji | Lucide Icon | Where Used |
|-------|------------|------------|
| 💬 (comments badge) | `message-square` | render.js comment badge |
| 📅 (due date) | `calendar` | render.js due date |
| 👋 (onboarding) | `wave-hand` or keep emoji | onboarding step 1 |
| ➕ (onboarding) | `plus` | onboarding step 2 |
| 🖱️ (onboarding) | `mouse-pointer` | onboarding step 3 |
| 📋 (onboarding) | `clipboard-list` | onboarding step 4 |
| 🚀🎯⚡🔥💡🌟🎨🔧 (project icons) | keep emoji | random project icons in createProject() |

### Keep as Emojis (decorative / contextual)
- Project random icons (🚀🎯⚡🔥💡🌟🎨🔧) — these are intentionally playful
- Onboarding step icons — keep as emojis for the friendly tone
- Status dots are CSS circles, not icons

## Implementation Steps

### 1. `index.html` — Add Lucide CDN + replace static emoji icons
- Add `<script src="https://unpkg.com/lucide-static@latest/dist/umd/lucide.min.js"></script>` before module scripts
- Replace emoji icons in HTML: logo, notification bell, theme toggle, sidebar toggle, export/import buttons, save filter, create button, delete/clone buttons
- Use `<i data-lucide="icon-name" class="icon"></i>` pattern

### 2. `utils.js` — Add icon helper function
- Add `lucideIcon(name, attrs = {})` that returns `<i data-lucide="${name}" ...></i>`
- This is used in dynamic template strings where we can't use `lucide.createIcons()` directly

### 3. `render.js` — Replace emoji icons in dynamic content
- `typeIcons` map → replace with Lucide icon names
- `createCard()` — type icons, comment badge, due date icon
- `renderViews()` — view list icons
- `renderListView()` — type icons in table
- `renderActivity()` — activity icons
- `renderProjects()` — project icons (keep emoji for random ones)

### 4. `main.js` — Replace emoji in activity messages and dynamic menus
- Activity log icons (create, delete, rename)
- Column menu items (rename, add card, clear, close)
- Theme toggle icon switching (moon/sun)

### 5. `data.js` — Replace emoji in activity messages
- Export/import/create project activity icons

### 6. `events.js` — Replace emoji in activity messages
- Delete, clone activity icons

### 7. `styles.css` — Add icon styling
- `.icon` class for consistent sizing (16px default)
- Dark mode overrides for icon colors
- Ensure icons inherit CSS custom properties properly

## Key Technical Notes
- Lucide static CDN: `https://unpkg.com/lucide-static@latest/dist/umd/lucide.min.js` exposes `lucide` global
- `lucide.createIcons()` scans for `[data-lucide]` attributes and replaces them with SVG
- For dynamically created elements, use the `icon()` helper + call `lucide.createIcons()` after DOM insertion
- Icons should use `currentColor` so they inherit text color and work in dark mode automatically
- Use `lucide.createIcons({ icons: { bell: ... } })` if we need specific icons only, but full CDN is simpler for this project size
