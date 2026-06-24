# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshot-capture.spec.mjs >> 29 - Dark Activity Feed
- Location: tests/screenshot-capture.spec.mjs:414:1

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
- generic [ref=e1]:
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
      - button "" [active] [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 
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
  334 |   const sidebar = page.locator('#sidebar');
  335 |   const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  336 |   if (state) {
  337 |     await page.locator('#sidebar-toggle').click();
  338 |     await page.waitForTimeout(300);
  339 |   }
  340 |   await capture(page, '23-dark-sidebar-open.png');
  341 | });
  342 | 
  343 | test('24 - Dark Sidebar Collapsed', async ({ page }) => {
  344 |   await navigate(page);
  345 |   await setTheme(page, 'dark');
  346 |   const sidebar = page.locator('#sidebar');
  347 |   const state = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  348 |   if (!state) {
  349 |     await page.locator('#sidebar-toggle').click();
  350 |     await page.waitForTimeout(300);
  351 |   }
  352 |   await capture(page, '24-dark-sidebar-collapsed.png');
  353 | });
  354 | 
  355 | test('25 - Dark Notifications', async ({ page }) => {
  356 |   await navigate(page);
  357 |   await setTheme(page, 'dark');
  358 |   await page.locator('#notification-bell').click();
  359 |   await page.waitForTimeout(500);
  360 |   await capture(page, '25-dark-notifications.png');
  361 | });
  362 | 
  363 | test('26 - Dark Calendar View', async ({ page }) => {
  364 |   await navigate(page);
  365 |   await setTheme(page, 'dark');
  366 |   // Click the calendar view item in sidebar
  367 |   const viewItems = page.locator('.view-item');
  368 |   const count = await viewItems.count();
  369 |   for (let i = 0; i < count; i++) {
  370 |     const text = await viewItems.nth(i).textContent();
  371 |     if (text && text.includes('Calendar')) {
  372 |       await viewItems.nth(i).click();
  373 |       break;
  374 |     }
  375 |   }
  376 |   await page.waitForTimeout(500);
  377 |   await capture(page, '26-dark-calendar.png');
  378 | });
  379 | 
  380 | test('27 - Dark Dashboard View', async ({ page }) => {
  381 |   await navigate(page);
  382 |   await setTheme(page, 'dark');
  383 |   // Click the dashboard view item in sidebar
  384 |   const viewItems = page.locator('.view-item');
  385 |   const count = await viewItems.count();
  386 |   for (let i = 0; i < count; i++) {
  387 |     const text = await viewItems.nth(i).textContent();
  388 |     if (text && text.includes('Dashboard')) {
  389 |       await viewItems.nth(i).click();
  390 |       break;
  391 |     }
  392 |   }
  393 |   await page.waitForTimeout(500);
  394 |   await capture(page, '27-dark-dashboard.png');
  395 | });
  396 | 
  397 | test('28 - Dark Bulk Action', async ({ page }) => {
  398 |   await navigate(page);
  399 |   await setTheme(page, 'dark');
  400 |   // Select multiple issues via bulk action
  401 |   const checkboxes = page.locator('.issue-checkbox').first();
  402 |   if (await checkboxes.isVisible()) {
  403 |     await checkboxes.click();
  404 |     await page.waitForTimeout(300);
  405 |     const checkboxes2 = page.locator('.issue-checkbox').nth(1);
  406 |     if (await checkboxes2.isVisible()) {
  407 |       await checkboxes2.click();
  408 |       await page.waitForTimeout(300);
  409 |     }
  410 |   }
  411 |   await capture(page, '28-dark-bulk-action.png');
  412 | });
  413 | 
  414 | test('29 - Dark Activity Feed', async ({ page }) => {
  415 |   await navigate(page);
  416 |   await setTheme(page, 'dark');
  417 |   const firstCard = page.locator('[data-status="todo"] .issue-card').first();
> 418 |   await firstCard.click();
      |                   ^ Error: locator.click: Test timeout of 15000ms exceeded.
  419 |   await page.waitForTimeout(500);
  420 |   await capture(page, '29-dark-activity-feed.png');
  421 | });
  422 | 
  423 | test('30 - Dark New Project Modal', async ({ page }) => {
  424 |   await navigate(page);
  425 |   await setTheme(page, 'dark');
  426 |   await page.locator('#add-project-btn').click();
  427 |   await page.waitForTimeout(500);
  428 |   await capture(page, '30-dark-new-project.png');
  429 | });
  430 | 
  431 | test('31 - Dark Overdue Detail', async ({ page }) => {
  432 |   await navigate(page);
  433 |   await setTheme(page, 'dark');
  434 |   const bell = page.locator('#notification-bell');
  435 |   if (await bell.isVisible()) {
  436 |     await bell.click();
  437 |     await page.waitForTimeout(300);
  438 |     const firstOverdue = page.locator('.notification-item').first();
  439 |     if (await firstOverdue.isVisible()) {
  440 |       await firstOverdue.click();
  441 |       await page.waitForTimeout(500);
  442 |     }
  443 |   }
  444 |   await capture(page, '31-dark-overdue-detail.png');
  445 | });
  446 | 
  447 | test('32 - Dark Mobile View', async ({ page }) => {
  448 |   await page.setViewportSize({ width: 375, height: 667 });
  449 |   await navigate(page);
  450 |   await setTheme(page, 'dark');
  451 |   await page.waitForTimeout(300);
  452 |   await capture(page, '32-dark-mobile.png');
  453 | });
  454 | 
```