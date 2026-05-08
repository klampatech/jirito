# Jirito UI/UX Evaluation Report

**Date:** 2026-05-04  
**Method:** Playwright automation — 24 screenshots across light/dark themes, views, and states  
**Viewport:** 1440×900 (desktop), 375×812 (mobile)

---

## 1. Color Scheme Assessment

### Light Theme
| Element | Current | Assessment |
|---------|---------|------------|
| Page BG | `#FAF8F5` (warm beige) | ✅ Pleasant, reduces eye strain vs pure white |
| Nav BG | `#091E42` (dark navy) | ✅ Strong contrast, professional |
| Primary | `#E85D3B` (coral/orange) | ⚠️ Good brand color but **fails WCAG AA** on white (ratio ~3.8:1). Use for large text/icons only, not small text/buttons |
| Secondary | `#2BB5A8` (teal) | ✅ Good contrast, pleasant accent |
| Card BG | `#FFFFFF` | ✅ Clean |
| Sidebar BG | `#F3F1EE` (warm gray) | ✅ Subtle separation from page |
| Text | `#2C2A28` (near-black) | ✅ Excellent contrast (14.5:1) |
| Text-muted | `#ADA89F` | ⚠️ **Fails WCAG AA** on white (ratio ~2.8:1). Too light for body text |
| Border | `#E8E4DF` | ✅ Subtle, warm |
| Status dots | `#7A756E` (todo) | ⚠️ Low contrast on `#FAF8F5` — barely visible |

### Dark Theme
| Element | Current | Assessment |
|---------|---------|------------|
| Page BG | `#1B1F24` | ✅ GitHub-dark inspired, good |
| Nav BG | `#0D1117` | ✅ Very dark, good contrast |
| Primary | `#58A6FF` (blue) | ✅ WCAG AA compliant on dark bg (7.8:1) |
| Card BG | `#292E34` | ✅ Good elevation vs page |
| Text | `#E6EDF3` | ✅ Excellent contrast (14.2:1) |
| Text-muted | `#8B949E` | ✅ OK on dark bg (4.6:1) |
| Border | `#30363D` | ✅ Subtle |
| Status dots | `#6B778C` (todo) | ✅ Better than light theme |

### Color Scheme Recommendations

1. **Fix primary button text contrast** — The coral `#E85D3B` on white fails WCAG AA for small text. Either darken to `#C44A2A` or use white text on the button (already done) but ensure minimum 16px font size.

2. **Darken `--text-muted`** — Change from `#ADA89F` to `#7A756E` (or `#6B6560`) for WCAG AA compliance on light bg.

3. **Improve "To Do" status dot visibility** — The gray `#7A756E` dot on `#FAF8F5` bg is nearly invisible. Use `#9E9E9E` or add a ring/border.

4. **Add a subtle column header accent** — Each column could have a thin top border matching its status color (todo=gray, inprogress=coral, review=amber, done=green) for visual scanning.

5. **Dark theme nav could be slightly lighter** — `#0D1117` is very dark; `#161B22` would reduce the harsh contrast jump from nav to page.

---

## 2. Layout & Spacing Issues

### High Priority

**A. Detail panel overlaps board content** (Screenshot 02)
- The 480px detail panel slides in from the right but doesn't push/resize the board
- Issue cards behind the panel are partially obscured
- **Fix:** Add `margin-right` to the board when panel is open, or overlay the panel with `backdrop-filter: blur(2px)` on the board

**B. Column count badges are hard to read** (Screenshot 01)
- The count pills (`3`, `1`, `1`, `1`) use `--text-light` on `--border` bg — low contrast
- **Fix:** Use a slightly darker bg for count pills, or increase font-weight

**C. "Add card" buttons blend in** (Screenshot 01)
- The `+ Add card` text at the bottom of each column is too subtle
- **Fix:** Add a hover background, or make it a proper outlined button

### Medium Priority

**D. Board header has too many elements crammed together** (Screenshot 01)
- Title, keyboard hint, 3 filter selects, Export/Import buttons all in one row
- On 1440px it's OK but tight; on smaller screens filters get hidden
- **Fix:** Group filters into a "Filters" dropdown button, or use a collapsible filter bar

**E. Sidebar is too wide at 260px** (Screenshot 01, 07)
- Takes ~18% of screen width; activity feed section is mostly empty
- **Fix:** Reduce to 240px, or make it collapsible to a mini-sidebar (icons only)

**F. List view table lacks visual hierarchy** (Screenshot 04)
- Table rows have no alternating row colors or hover states beyond background
- No sort indicators on column headers
- **Fix:** Add `tr:nth-child(even)` background, sort arrows on headers

### Low Priority

**G. Modal could be wider** (Screenshot 03)
- Create Issue modal at 560px feels narrow for the form fields
- **Fix:** Increase to 640px or use a two-column form layout

**H. Column menu uses inline styles** (Screenshot 15)
- The column "..." menu has hardcoded `box-shadow` and `position` — not theme-aware
- **Fix:** Move to CSS classes

---

## 3. Functional Issues

### High Priority

**A. No visual feedback on drag-and-drop** (Screenshot 16)
- Cards don't show a "ghost" preview during drag
- Column drop targets don't highlight until hover
- **Fix:** Add a drag ghost card that follows the cursor, and highlight the drop zone with a dashed border

**B. Bulk action bar priority/assignee dropdowns are hidden** (Screenshot 14)
- They're `display:none` by default — users won't know they exist
- **Fix:** Show them always, or add a "More options" expand button

**C. No loading states** — Creating issues, switching projects, or applying filters has no spinner
- **Fix:** Add a subtle skeleton loader or spinner for async operations

### Medium Priority

**D. Search input doesn't show results count**
- Typing in search doesn't indicate how many results match
- **Fix:** Add "(3 results)" text or a magnifying glass icon with count

**E. Notification bell doesn't auto-refresh**
- Overdue count is only updated on page load, not when cards are moved
- **Fix:** Call `updateNotifications()` after every status change

**F. No confirmation before clearing a column** (Screenshot 15)
- The "Clear all cards" menu option has no confirmation dialog
- **Fix:** Add `confirm()` or a custom confirmation modal

### Low Priority

**G. Activity feed doesn't scroll to newest**
- New activities are prepended but the feed doesn't auto-scroll
- **Fix:** `feed.scrollTop = 0` on new activity

**H. No keyboard shortcut for bulk actions**
- `⌘K` for search, `⌘N` for new issue, but no shortcut for bulk operations
- **Fix:** Add `⌘B` for bulk select mode

---

## 4. Mobile/Responsive Issues

### Critical

**A. Board columns require horizontal scroll on mobile** (Screenshots 19, 20)
- All 4 columns are visible but squished; horizontal scroll is needed
- **Fix:** Stack columns vertically on mobile (one column per screen), or use a column picker

**B. Detail panel is full-width on mobile** (Screenshots 19, 20)
- Takes over the entire screen with no way to go back except the × button
- **Fix:** Add a "← Back" button at the top, or use a bottom sheet pattern

### Medium

**C. Filter group is hidden on mobile** (Screenshots 19, 20)
- `.filter-group { display: none }` at 768px — filters are completely inaccessible on mobile
- **Fix:** Replace with a "Filters" button that opens a bottom sheet or modal

**D. Export/Import buttons hidden on mobile** (Screenshots 19, 20)
- `.export-import-group { display: none }` — no way to access these features on mobile
- **Fix:** Add to a "..." menu or the detail panel

---

## 5. Accessibility Issues

### High Priority

**A. `--text-muted` fails WCAG AA contrast** (light theme)
- `#ADA89F` on `#FFFFFF` = ~2.8:1 (needs 4.5:1)
- **Fix:** Change to `#7A756E` (7.2:1) or `#6B6560` (8.5:1)

**B. Status dot for "To Do" has poor contrast**
- Gray dot on light bg is nearly invisible
- **Fix:** Add a white ring around the dot, or use a darker color

### Medium

**C. Column menu items use `lucideIcon()` which may not render in dynamically created menus**
- The column "..." menu creates icons via `lucideIcon()` but doesn't call `lucide.createIcons()` after
- **Fix:** Call `lucide.createIcons()` after appending the menu

**D. Checkbox labels are missing**
- Issue checkboxes don't have associated `<label>` elements
- **Fix:** Add `aria-label` to each checkbox

---

## 6. Recommended CSS Tweaks (Priority Order)

```css
/* 1. Fix muted text contrast (light theme) */
:root {
  --text-muted: #7A756E; /* was #ADA89F */
}

/* 2. Improve To Do status dot visibility */
.status-dot.todo {
  background: #9E9E9E;
  box-shadow: 0 0 0 2px var(--bg-page);
}

/* 3. Add column header accent bars */
.column[data-status="todo"] .column-header { border-top: 3px solid var(--status-todo); }
.column[data-status="inprogress"] .column-header { border-top: 3px solid var(--status-inprogress); }
.column[data-status="review"] .column-header { border-top: 3px solid var(--status-review); }
.column[data-status="done"] .column-header { border-top: 3px solid var(--status-done); }

/* 4. Improve "Add card" button visibility */
.btn-add-card {
  background: var(--bg-card);
  border: 1px dashed var(--border);
  color: var(--text-muted);
}
.btn-add-card:hover {
  background: var(--hover-bg);
  color: var(--primary);
  border-color: var(--primary);
}

/* 5. Detail panel backdrop */
.detail-panel.open ~ .board {
  filter: brightness(0.95);
}

/* 6. Count badge contrast */
.count {
  background: var(--border-light);
  color: var(--text);
  font-weight: 600;
}

/* 7. Dark theme nav slightly lighter */
[data-theme="dark"] .topnav {
  background: #161B22; /* was #0D1117 */
}

/* 8. List view alternating rows */
.issue-table tbody tr:nth-child(even) {
  background: var(--bg-page);
}

/* 9. Darker primary for WCAG compliance */
:root {
  --primary: #C44A2A; /* was #E85D3B */
}
```

---

## 7. Summary of Top 5 Improvements

| # | Category | Issue | Impact |
|---|----------|-------|--------|
| 1 | **Color** | Darken `--text-muted` and `--primary` for WCAG AA compliance | Accessibility — critical |
| 2 | **Layout** | Add backdrop blur/fade to board when detail panel is open | Visual clarity |
| 3 | **Color** | Add colored top borders to column headers | Visual scanning speed |
| 4 | **Function** | Show bulk action dropdowns (priority/assignee) by default | Discoverability |
| 5 | **Mobile** | Stack Kanban columns vertically on mobile | Mobile usability |

---

## Screenshots Reference

| # | Screenshot | Theme | State |
|---|-----------|-------|-------|
| 1 | `01-light-board.png` | Light | Default board |
| 2 | `02-light-detail-panel.png` | Light | Detail panel open |
| 3 | `03-light-create-modal.png` | Light | Create issue modal |
| 4 | `04-light-list-view.png` | Light | List/table view |
| 5 | `05-light-filters.png` | Light | Filters applied |
| 6 | `06-light-search.png` | Light | Search active |
| 7 | `07-light-sidebar-collapsed.png` | Light | Sidebar hidden |
| 8 | `08-light-notifications.png` | Light | Notification dropdown |
| 9 | `09-dark-board.png` | Dark | Default board |
| 10 | `10-dark-detail-panel.png` | Dark | Detail panel open |
| 11 | `11-dark-create-modal.png` | Dark | Create issue modal |
| 12 | `12-dark-list-view.png` | Dark | List/table view |
| 13 | `13-dark-sidebar-collapsed.png` | Dark | Sidebar hidden |
| 14 | `14-dark-bulk-action.png` | Dark | Bulk action bar |
| 15 | `15-dark-column-menu.png` | Dark | Column "..." menu |
| 16 | `16-light-drag-preview.png` | Light | Drag hover state |
| 17 | `17-light-activity-feed.png` | Light | Activity feed |
| 18 | `18-dark-activity-feed.png` | Dark | Activity feed |
| 19 | `19-light-mobile.png` | Light | Mobile (375px) |
| 20 | `20-dark-mobile.png` | Dark | Mobile (375px) |
| 21 | `21-light-new-project-modal.png` | Light | New project modal |
| 22 | `22-dark-new-project-modal.png` | Dark | New project modal |
| 23 | `23-light-overdue-detail.png` | Light | Overdue issue detail |
| 24 | `24-dark-overdue-detail.png` | Dark | Overdue issue detail |
