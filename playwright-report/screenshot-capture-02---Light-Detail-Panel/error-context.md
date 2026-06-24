# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshot-capture.spec.mjs >> 02 - Light Detail Panel
- Location: tests/screenshot-capture.spec.mjs:100:1

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
  5   | 
  6   | const __dirname = dirname(fileURLToPath(import.meta.url));
  7   | const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots');
  8   | const APP_URL = 'http://127.0.0.1:8080/';
  9   | 
  10  | // Helper to clear localStorage safely
  11  | async function clearStorage(page) {
  12  |   try {
  13  |     await page.evaluate(() => localStorage.clear());
  14  |   } catch {
  15  |     // file:// protocol may block localStorage access
  16  |   }
  17  | }
  18  | 
  19  | // Helper to navigate to the app
  20  | async function navigate(page) {
  21  |   await clearStorage(page);
  22  |   await page.goto(APP_URL);
  23  |   await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  24  | 
  25  |   // Seed sample data so the board renders with issue cards.
  26  |   // Without this, the board is empty and tests that interact with cards
  27  |   // (detail panel, drag preview, activity feed) will timeout.
  28  |   await page.evaluate(() => {
  29  |     const sampleData = {
  30  |       issues: [
  31  |         { id: 'PROJ-101', title: 'Design system tokens', description: 'Define color tokens', status: 'todo', priority: 'high', labels: ['design'], assignee: 'Alice', reporter: 'Bob', projectId: 'default', sprintId: null, storyPoints: 5, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  32  |         { id: 'PROJ-102', title: 'Auth flow', description: 'Implement OAuth', status: 'todo', priority: 'high', labels: ['backend'], assignee: 'Charlie', reporter: 'Alice', projectId: 'default', sprintId: null, storyPoints: 8, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  33  |         { id: 'PROJ-103', title: 'API endpoints', description: 'REST API design', status: 'inprogress', priority: 'medium', labels: ['backend'], assignee: 'Diana', reporter: 'Bob', projectId: 'default', sprintId: null, storyPoints: 3, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  34  |         { id: 'PROJ-104', title: 'Unit tests', description: 'Core module tests', status: 'inprogress', priority: 'medium', labels: ['testing'], assignee: 'Eve', reporter: 'Alice', projectId: 'default', sprintId: null, storyPoints: 5, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  35  |         { id: 'PROJ-105', title: 'Wireframes', description: 'Dashboard wireframes', status: 'inreview', priority: 'low', labels: ['design'], assignee: 'Alice', reporter: 'Charlie', projectId: 'default', sprintId: null, storyPoints: 2, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  36  |         { id: 'PROJ-106', title: 'Deploy pipeline', description: 'CI/CD setup', status: 'done', priority: 'medium', labels: ['devops'], assignee: 'Frank', reporter: 'Bob', projectId: 'default', sprintId: null, storyPoints: 5, parentIssueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  37  |       ],
  38  |       projects: {
  39  |         default: { name: 'Project Alpha', key: 'PROJ', icon: '\uD83D\uDE80', color: '#0052CC', description: '', issues: ['PROJ-101','PROJ-102','PROJ-103','PROJ-104','PROJ-105','PROJ-106'] },
  40  |       },
  41  |       currentProject: 'default',
  42  |       savedFilters: [],
  43  |       activityLog: [],
  44  |       issueCounter: 107,
  45  |       trash: [],
  46  |       sprints: {},
  47  |       columns: [],
  48  |       comments: {},
  49  |     };
  50  |     localStorage.setItem('jirito-state', JSON.stringify(sampleData));
  51  |     localStorage.setItem('jirito-onboarding', 'true');
  52  |   });
  53  |   // Reload to load the seeded data
  54  |   await page.reload();
  55  |   await page.waitForSelector('#view-list .view-item', { state: 'visible', timeout: 5000 });
  56  |   // Dismiss onboarding if it appears
  57  |   const onboarding = page.locator('#onboarding-overlay');
  58  |   if (await onboarding.isVisible()) {
  59  |     await page.locator('#onboarding-skip').click();
  60  |   }
  61  | }
  62  | 
  63  | // Helper to set theme and wait
  64  | async function setTheme(page, theme) {
  65  |   if (theme === 'dark') {
  66  |     const current = await page.evaluate(() => localStorage.getItem('jirito-theme'));
  67  |     if (current !== 'dark') {
  68  |       await page.locator('#theme-toggle').click();
  69  |       await page.waitForTimeout(500);
  70  |     }
  71  |   } else {
  72  |     const current = await page.evaluate(() => localStorage.getItem('jirito-theme'));
  73  |     if (current === 'dark') {
  74  |       await page.locator('#theme-toggle').click();
  75  |       await page.waitForTimeout(500);
  76  |     }
  77  |   }
  78  | }
  79  | 
  80  | // Helper to take screenshot
  81  | async function capture(page, name, viewport) {
  82  |   const dir = join(SCREENSHOT_DIR, 'automation');
  83  |   mkdirSync(dir, { recursive: true });
  84  |   await page.screenshot({ path: join(dir, name), fullPage: false });
  85  |   console.log(`  ✓ Captured: ${name}`);
  86  | }
  87  | 
  88  | // Set viewport
  89  | test.use({ viewport: { width: 1440, height: 900 } });
  90  | 
  91  | // ===== LIGHT MODE SCREENSHOTS =====
  92  | 
  93  | test('01 - Light Board View', async ({ page }) => {
  94  |   await navigate(page);
  95  |   await setTheme(page, 'light');
  96  |   await page.waitForTimeout(300);
  97  |   await capture(page, '01-light-board.png');
  98  | });
  99  | 
  100 | test('02 - Light Detail Panel', async ({ page }) => {
  101 |   await navigate(page);
  102 |   await setTheme(page, 'light');
  103 |   // Click the first issue card to open detail panel
  104 |   const firstCard = page.locator('[data-status="todo"] .issue-card').first();
> 105 |   await firstCard.click();
      |                   ^ Error: locator.click: Test timeout of 15000ms exceeded.
  106 |   await page.waitForTimeout(500);
  107 |   await capture(page, '02-light-detail-panel.png');
  108 | });
  109 | 
  110 | test('03 - Light Create Modal', async ({ page }) => {
  111 |   await navigate(page);
  112 |   await setTheme(page, 'light');
  113 |   await page.locator('#add-issue-btn').click();
  114 |   await page.waitForTimeout(500);
  115 |   await capture(page, '03-light-create-modal.png');
  116 | });
  117 | 
  118 | test('04 - Light List View', async ({ page }) => {
  119 |   await navigate(page);
  120 |   await setTheme(page, 'light');
  121 |   // Click 'List' view item in sidebar
  122 |   const viewItems = page.locator('.view-item');
  123 |   const count = await viewItems.count();
  124 |   for (let i = 0; i < count; i++) {
  125 |     const text = await viewItems.nth(i).textContent();
  126 |     if (text && text.includes('List')) {
  127 |       await viewItems.nth(i).click();
  128 |       break;
  129 |     }
  130 |   }
  131 |   await page.waitForTimeout(500);
  132 |   await capture(page, '04-light-list-view.png');
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
```