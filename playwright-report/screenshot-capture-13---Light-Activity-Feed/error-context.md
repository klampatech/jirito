# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshot-capture.spec.mjs >> 13 - Light Activity Feed
- Location: tests/screenshot-capture.spec.mjs:229:1

# Error details

```
Test timeout of 15000ms exceeded.
```

```
Error: locator.click: Test timeout of 15000ms exceeded.
Call log:
  - waiting for locator('[data-status="todo"] .issue-card').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e4]:
      - img "Jirito" [ref=e5]
      - text: Jirito
    - generic [ref=e6]:
      - textbox "Search..." [ref=e7]
      - button " Create" [ref=e8] [cursor=pointer]:
        - generic [ref=e9]: 
        - text: Create
      - generic "No notifications" [ref=e10] [cursor=pointer]:
        - generic [ref=e11]: 
      - generic [ref=e12] [cursor=pointer]: K
      - button "" [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 
  - text: 
  - generic [ref=e15]:
    - heading "📋 Project Alpha — Board" [level=1] [ref=e16]
    - generic [ref=e17]: ⌘K to search
    - generic [ref=e18]:
      - generic [ref=e19]:
        - combobox [ref=e20] [cursor=pointer]:
          - option "All Types" [selected]
          - option "Stories"
          - option "Bugs"
          - option "Tasks"
          - option "Epics"
        - combobox [ref=e21] [cursor=pointer]:
          - option "All Priorities" [selected]
          - option "High"
          - option "Medium"
          - option "Low"
        - combobox [ref=e22] [cursor=pointer]:
          - option "All Assignees" [selected]
      - generic [ref=e23]:
        - button " Export" [ref=e24] [cursor=pointer]:
          - generic [ref=e25]: 
          - text: Export
        - button " Import" [ref=e26] [cursor=pointer]:
          - generic [ref=e27]: 
          - text: Import
        - button " Columns" [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: 
          - text: Columns
      - button " Manage Sprints" [ref=e30] [cursor=pointer]:
        - generic [ref=e31]: 
        - text: Manage Sprints
  - generic [ref=e32]:
    - generic [ref=e33]:
      - button "" [ref=e34]:
        - generic [ref=e35]: 
      - generic [ref=e36]:
        - generic [ref=e37]:
          - heading "Projects" [level=3] [ref=e38]
          - generic [ref=e40] [cursor=pointer]:
            - generic [ref=e41]: 📋
            - generic [ref=e42]: PROJ
            - generic "Click to rename" [ref=e43]: Project Alpha
            - button "✕" [ref=e44]
          - button "+ New Project" [ref=e45] [cursor=pointer]
        - generic [ref=e46]:
          - heading "Views" [level=3] [ref=e47]
          - generic [ref=e48]:
            - generic [ref=e49] [cursor=pointer]:
              - generic [ref=e51]: 
              - generic [ref=e52]: Board
            - generic [ref=e53] [cursor=pointer]:
              - generic [ref=e55]: 
              - generic [ref=e56]: List
            - generic [ref=e57] [cursor=pointer]:
              - generic [ref=e59]: 
              - generic [ref=e60]: Calendar
            - generic [ref=e61] [cursor=pointer]:
              - generic [ref=e63]: 
              - generic [ref=e64]: Dashboard
        - generic [ref=e65]:
          - heading "Saved Filters" [level=3] [ref=e66]
          - button " Save Current Filter" [ref=e67] [cursor=pointer]:
            - generic [ref=e68]: 
            - text: Save Current Filter
        - heading "Activity" [level=3] [ref=e70]
    - generic [ref=e71]:
      - generic [ref=e72]:
        - generic [ref=e73]:
          - generic [ref=e74]:
            - generic [ref=e76]: To Do
            - generic [ref=e77]: "0"
          - button "⋯" [ref=e78] [cursor=pointer]
        - list "To Do column" [ref=e79]: Drag cards here
        - button "+ Add card" [ref=e81] [cursor=pointer]
      - generic [ref=e82]:
        - generic [ref=e83]:
          - generic [ref=e84]:
            - generic [ref=e86]: In Progress
            - generic [ref=e87]: "0"
          - button "⋯" [ref=e88] [cursor=pointer]
        - list "In Progress column" [ref=e89]: Drag cards here
        - button "+ Add card" [ref=e91] [cursor=pointer]
      - generic [ref=e92]:
        - generic [ref=e93]:
          - generic [ref=e94]:
            - generic [ref=e96]: In Review
            - generic [ref=e97]: "0"
          - button "⋯" [ref=e98] [cursor=pointer]
        - list "In Review column" [ref=e99]: Drag cards here
        - button "+ Add card" [ref=e101] [cursor=pointer]
      - generic [ref=e102]:
        - generic [ref=e103]:
          - generic [ref=e104]:
            - generic [ref=e106]: Done
            - generic [ref=e107]: "0"
          - button "⋯" [ref=e108] [cursor=pointer]
        - list "Done column" [ref=e109]: Drag cards here
        - button "+ Add card" [ref=e111] [cursor=pointer]
  - generic [ref=e113]:
    - heading "Issue Details" [level=2] [ref=e114]
    - generic [ref=e115]:
      - text: 
      - button " Delete" [ref=e116] [cursor=pointer]:
        - generic [ref=e117]: 
        - text: Delete
      - button "×" [ref=e118] [cursor=pointer]
  - text:   
```

# Test source

```ts
  133 | });
  134 | 
  135 | test('05 - Light Filters', async ({ page }) => {
  136 |   await navigate(page);
  137 |   await setTheme(page, 'light');
  138 |   // Filters are always visible on the board header
  139 |   await page.waitForSelector('.filter-group', { state: 'visible' });
  140 |   await page.waitForTimeout(500);
  141 |   await capture(page, '05-light-filters.png');
  142 | });
  143 | 
  144 | test('06 - Light Search', async ({ page }) => {
  145 |   await navigate(page);
  146 |   await setTheme(page, 'light');
  147 |   await page.locator('#search-input').fill('PROJ');
  148 |   await page.waitForTimeout(500);
  149 |   await capture(page, '06-light-search.png');
  150 | });
  151 | 
  152 | test('07 - Light Sidebar Open', async ({ page }) => {
  153 |   await navigate(page);
  154 |   await setTheme(page, 'light');
  155 |   // Make sure sidebar is open
  156 |   const sidebar = page.locator('#sidebar');
  157 |   const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  158 |   if (state) {
  159 |     await page.locator('#sidebar-toggle').click();
  160 |     await page.waitForTimeout(300);
  161 |   }
  162 |   await capture(page, '07-light-sidebar-open.png');
  163 | });
  164 | 
  165 | test('08 - Light Sidebar Collapsed', async ({ page }) => {
  166 |   await navigate(page);
  167 |   await setTheme(page, 'light');
  168 |   // Collapse sidebar
  169 |   const sidebar = page.locator('#sidebar');
  170 |   const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  171 |   if (!state) {
  172 |     await page.locator('#sidebar-toggle').click();
  173 |     await page.waitForTimeout(300);
  174 |   }
  175 |   await capture(page, '08-light-sidebar-collapsed.png');
  176 | });
  177 | 
  178 | test('09 - Light Notifications', async ({ page }) => {
  179 |   await navigate(page);
  180 |   await setTheme(page, 'light');
  181 |   await page.locator('#notification-bell').click();
  182 |   await page.waitForTimeout(500);
  183 |   await capture(page, '09-light-notifications.png');
  184 | });
  185 | 
  186 | test('10 - Light Calendar View', async ({ page }) => {
  187 |   await navigate(page);
  188 |   await setTheme(page, 'light');
  189 |   // Click the calendar view item in sidebar
  190 |   const viewItems = page.locator('.view-item');
  191 |   const count = await viewItems.count();
  192 |   for (let i = 0; i < count; i++) {
  193 |     const text = await viewItems.nth(i).textContent();
  194 |     if (text && text.includes('Calendar')) {
  195 |       await viewItems.nth(i).click();
  196 |       break;
  197 |     }
  198 |   }
  199 |   await page.waitForTimeout(500);
  200 |   await capture(page, '10-light-calendar.png');
  201 | });
  202 | 
  203 | test('11 - Light Dashboard View', async ({ page }) => {
  204 |   await navigate(page);
  205 |   await setTheme(page, 'light');
  206 |   // Click the dashboard view item in sidebar
  207 |   const viewItems = page.locator('.view-item');
  208 |   const count = await viewItems.count();
  209 |   for (let i = 0; i < count; i++) {
  210 |     const text = await viewItems.nth(i).textContent();
  211 |     if (text && text.includes('Dashboard')) {
  212 |       await viewItems.nth(i).click();
  213 |       break;
  214 |     }
  215 |   }
  216 |   await page.waitForTimeout(500);
  217 |   await capture(page, '11-light-dashboard.png');
  218 | });
  219 | 
  220 | test('12 - Light Drag Preview', async ({ page }) => {
  221 |   await navigate(page);
  222 |   await setTheme(page, 'light');
  223 |   const card = page.locator('[data-status="todo"] .issue-card').first();
  224 |   await card.hover();
  225 |   await page.waitForTimeout(300);
  226 |   await capture(page, '12-light-drag-preview.png');
  227 | });
  228 | 
  229 | test('13 - Light Activity Feed', async ({ page }) => {
  230 |   await navigate(page);
  231 |   await setTheme(page, 'light');
  232 |   const firstCard = page.locator('[data-status="todo"] .issue-card').first();
> 233 |   await firstCard.click();
      |                   ^ Error: locator.click: Test timeout of 15000ms exceeded.
  234 |   await page.waitForTimeout(500);
  235 |   await capture(page, '13-light-activity-feed.png');
  236 | });
  237 | 
  238 | test('14 - Light New Project Modal', async ({ page }) => {
  239 |   await navigate(page);
  240 |   await setTheme(page, 'light');
  241 |   // Open new project modal via sidebar button
  242 |   await page.locator('#add-project-btn').click();
  243 |   await page.waitForTimeout(500);
  244 |   await capture(page, '14-light-new-project.png');
  245 | });
  246 | 
  247 | test('15 - Light Overdue Detail', async ({ page }) => {
  248 |   await navigate(page);
  249 |   await setTheme(page, 'light');
  250 |   // Click notification bell then click first overdue item
  251 |   const bell = page.locator('#notification-bell');
  252 |   if (await bell.isVisible()) {
  253 |     await bell.click();
  254 |     await page.waitForTimeout(300);
  255 |     const firstOverdue = page.locator('.notification-item').first();
  256 |     if (await firstOverdue.isVisible()) {
  257 |       await firstOverdue.click();
  258 |       await page.waitForTimeout(500);
  259 |     }
  260 |   }
  261 |   await capture(page, '15-light-overdue-detail.png');
  262 | });
  263 | 
  264 | test('16 - Light Mobile View', async ({ page }) => {
  265 |   await page.setViewportSize({ width: 375, height: 667 });
  266 |   await navigate(page);
  267 |   await setTheme(page, 'light');
  268 |   await page.waitForTimeout(300);
  269 |   await capture(page, '16-light-mobile.png');
  270 | });
  271 | 
  272 | // ===== DARK MODE SCREENSHOTS =====
  273 | 
  274 | test('17 - Dark Board View', async ({ page }) => {
  275 |   await navigate(page);
  276 |   await setTheme(page, 'dark');
  277 |   await page.waitForTimeout(500);
  278 |   await capture(page, '17-dark-board.png');
  279 | });
  280 | 
  281 | test('18 - Dark Detail Panel', async ({ page }) => {
  282 |   await navigate(page);
  283 |   await setTheme(page, 'dark');
  284 |   const firstCard = page.locator('[data-status="todo"] .issue-card').first();
  285 |   await firstCard.click();
  286 |   await page.waitForTimeout(500);
  287 |   await capture(page, '18-dark-detail-panel.png');
  288 | });
  289 | 
  290 | test('19 - Dark Create Modal', async ({ page }) => {
  291 |   await navigate(page);
  292 |   await setTheme(page, 'dark');
  293 |   await page.locator('#add-issue-btn').click();
  294 |   await page.waitForTimeout(500);
  295 |   await capture(page, '19-dark-create-modal.png');
  296 | });
  297 | 
  298 | test('20 - Dark List View', async ({ page }) => {
  299 |   await navigate(page);
  300 |   await setTheme(page, 'dark');
  301 |   // Click 'List' view item in sidebar
  302 |   const viewItems = page.locator('.view-item');
  303 |   const count = await viewItems.count();
  304 |   for (let i = 0; i < count; i++) {
  305 |     const text = await viewItems.nth(i).textContent();
  306 |     if (text && text.includes('List')) {
  307 |       await viewItems.nth(i).click();
  308 |       break;
  309 |     }
  310 |   }
  311 |   await page.waitForTimeout(500);
  312 |   await capture(page, '20-dark-list-view.png');
  313 | });
  314 | 
  315 | test('21 - Dark Filters', async ({ page }) => {
  316 |   await navigate(page);
  317 |   await setTheme(page, 'dark');
  318 |   await page.waitForSelector('.filter-group', { state: 'visible' });
  319 |   await page.waitForTimeout(500);
  320 |   await capture(page, '21-dark-filters.png');
  321 | });
  322 | 
  323 | test('22 - Dark Search', async ({ page }) => {
  324 |   await navigate(page);
  325 |   await setTheme(page, 'dark');
  326 |   await page.locator('#search-input').fill('PROJ');
  327 |   await page.waitForTimeout(500);
  328 |   await capture(page, '22-dark-search.png');
  329 | });
  330 | 
  331 | test('23 - Dark Sidebar Open', async ({ page }) => {
  332 |   await navigate(page);
  333 |   await setTheme(page, 'dark');
```