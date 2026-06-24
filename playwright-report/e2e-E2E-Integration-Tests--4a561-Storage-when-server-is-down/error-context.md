# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.mjs >> E2E Integration Tests >> should fallback to localStorage when server is down
- Location: tests/e2e.spec.mjs:90:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#board').getByRole('button', { name: 'PROJ-107: Offline Test Issue' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#board').getByRole('button', { name: 'PROJ-107: Offline Test Issue' })

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
    - heading "🚀 Project Alpha — Board" [level=1] [ref=e16]
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
            - generic [ref=e41]: 🚀
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
        - generic [ref=e69]:
          - heading "Activity" [level=3] [ref=e70]
          - generic [ref=e72]:
            - generic [ref=e73]:
              - text: Created
              - strong [ref=e74]: PROJ-101
            - generic [ref=e75]: just now
    - generic [ref=e76]:
      - generic [ref=e77]:
        - generic [ref=e78]:
          - generic [ref=e79]:
            - generic [ref=e81]: To Do
            - generic [ref=e82]: "1"
          - button "⋯" [ref=e83] [cursor=pointer]
        - list "To Do column" [ref=e84]:
          - 'button "PROJ-101: Offline Test Issue" [ref=e85]':
            - generic [ref=e86]:
              - checkbox "Select issue PROJ-101" [ref=e87]
              - generic [ref=e88]: PROJ-101
              - generic [ref=e90]: 
            - generic [ref=e91]: Offline Test Issue
            - generic [ref=e92]: Should work offline
            - generic [ref=e94]: medium
        - button "+ Add card" [ref=e96] [cursor=pointer]
      - generic [ref=e97]:
        - generic [ref=e98]:
          - generic [ref=e99]:
            - generic [ref=e101]: In Progress
            - generic [ref=e102]: "0"
          - button "⋯" [ref=e103] [cursor=pointer]
        - list "In Progress column" [ref=e104]: Drag cards here
        - button "+ Add card" [ref=e106] [cursor=pointer]
      - generic [ref=e107]:
        - generic [ref=e108]:
          - generic [ref=e109]:
            - generic [ref=e111]: In Review
            - generic [ref=e112]: "0"
          - button "⋯" [ref=e113] [cursor=pointer]
        - list "In Review column" [ref=e114]: Drag cards here
        - button "+ Add card" [ref=e116] [cursor=pointer]
      - generic [ref=e117]:
        - generic [ref=e118]:
          - generic [ref=e119]:
            - generic [ref=e121]: Done
            - generic [ref=e122]: "0"
          - button "⋯" [ref=e123] [cursor=pointer]
        - list "Done column" [ref=e124]: Drag cards here
        - button "+ Add card" [ref=e126] [cursor=pointer]
  - generic [ref=e128]:
    - heading "Issue Details" [level=2] [ref=e129]
    - generic [ref=e130]:
      - text: 
      - button " Delete" [ref=e131] [cursor=pointer]:
        - generic [ref=e132]: 
        - text: Delete
      - button "×" [ref=e133] [cursor=pointer]
  - text:   
  - alert [ref=e136]:
    - generic [ref=e137]: Created PROJ-101
    - button "Undo" [ref=e138] [cursor=pointer]
```

# Test source

```ts
  40  | 
  41  |   test('should load data from server on startup', async ({ page }) => {
  42  |     // Uses the standard seedIssues fixture (3 todo, 1 inprogress, 1 review, 1 done = 6 total).
  43  |     // The test verifies the data is loaded from the server on the first page load.
  44  |     await seedIssues();
  45  | 
  46  |     const { consoleMessages, errors } = await navigate(page);
  47  |     consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
  48  |     if (errors.length > 0) {
  49  |       console.log(`JS ERRORS: ${JSON.stringify(errors)}`);
  50  |     }
  51  | 
  52  |     // All 6 seeded issues should be rendered as cards across the 4 columns.
  53  |     const cards = page.locator('#board .issue-card');
  54  |     await expect(cards).toHaveCount(6);
  55  | 
  56  |     // Spot-check that the seeded titles appear on the board.
  57  |     const board = await page.locator('#board').textContent();
  58  |     expect(board).toContain('Design login page mockup');
  59  |     expect(board).toContain('Fix auth token refresh bug');
  60  |     expect(board).toContain('Update dependencies');
  61  |   });
  62  | 
  63  |   test('should save data to server via UI', async ({ page }) => {
  64  |     const { consoleMessages, errors } = await navigate(page);
  65  |     consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
  66  |     if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);
  67  | 
  68  |     await page.locator('#add-issue-btn').click();
  69  |     await page.locator('#issue-title').fill('E2E UI Created Issue');
  70  |     await page.locator('#issue-desc').fill('Created via E2E test UI');
  71  |     await page.locator('#issue-type').selectOption('story');
  72  |     await page.locator('#issue-priority').selectOption('high');
  73  |     await page.locator('#issue-story-points').fill('5');
  74  |     await page.locator('#issue-assignee').fill('Test User');
  75  |     await page.locator('#issue-form button[type="submit"]').click();
  76  | 
  77  |     await expect(page.locator('#board')).toContainText('E2E UI Created Issue');
  78  | 
  79  |     // Wait for the save to complete
  80  |     await page.waitForTimeout(1500);
  81  |     
  82  |     // Verify the issue was saved to the server
  83  |     const resp = await page.request.get('http://127.0.0.1:3001/api/issues');
  84  |     const issues = await resp.json();
  85  |     const found = issues.find(i => i.title === 'E2E UI Created Issue');
  86  |     expect(found).toBeDefined();
  87  |     expect(found.priority).toBe('high');
  88  |   });
  89  | 
  90  |   test('should fallback to localStorage when server is down', async ({ page }) => {
  91  |     // Override fetch to block ALL server requests before page loads
  92  |     await page.addInitScript(() => {
  93  |       const originalFetch = window.fetch;
  94  |       window.fetch = function(url, ...args) {
  95  |         if (typeof url === 'string' && (url.includes('127.0.0.1:3001') || url === '/api/health' || url.startsWith('/api/'))) {
  96  |           return Promise.reject(new Error('Connection refused'));
  97  |         }
  98  |         return originalFetch.call(this, url, ...args);
  99  |       };
  100 |     });
  101 |     
  102 |     const consoleMessages = [];
  103 |     const errors = [];
  104 |     page.on('console', msg => {
  105 |       if (msg.type() === 'error') errors.push(msg.text());
  106 |       consoleMessages.push({ type: msg.type(), text: msg.text() });
  107 |     });
  108 |     page.on('pageerror', err => {
  109 |       errors.push(err.message);
  110 |     });
  111 |     
  112 |     await page.goto(APP_URL);
  113 |     
  114 |     const onboarding = page.locator('#onboarding-overlay');
  115 |     if (await onboarding.isVisible()) {
  116 |       await page.locator('#onboarding-skip').click();
  117 |     }
  118 |     
  119 |     await page.waitForSelector('#board', { state: 'visible', timeout: 5000 });
  120 |     await page.waitForTimeout(2000);
  121 |     
  122 |     consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));
  123 |     if (errors.length > 0) console.log(`JS ERRORS: ${JSON.stringify(errors)}`);
  124 | 
  125 |     // Verify offline mode is active
  126 |     const offlineMsg = await page.evaluate(() => {
  127 |       const storage = window.storage;
  128 |       return storage ? storage.getStorageType() : 'unknown';
  129 |     });
  130 |     expect(offlineMsg).toBe('offline');
  131 | 
  132 |     // Create an issue — it should be saved to localStorage (not server)
  133 |     await page.locator('#add-issue-btn').click();
  134 |     await page.locator('#issue-title').fill('Offline Test Issue');
  135 |     await page.locator('#issue-desc').fill('Should work offline');
  136 |     await page.locator('#issue-type').selectOption('bug');
  137 |     await page.locator('#issue-priority').selectOption('medium');
  138 |     await page.locator('#issue-form button[type="submit"]').click();
  139 | 
> 140 |     await expect(page.locator('#board').getByRole('button', { name: 'PROJ-107: Offline Test Issue' })).toBeVisible();
      |                                                                                                        ^ Error: expect(locator).toBeVisible() failed
  141 | 
  142 |     // Wait for the save to complete
  143 |     await page.waitForTimeout(1000);
  144 | 
  145 |     // Verify the issue was saved to localStorage
  146 |     const stored = await page.evaluate(() => localStorage.getItem('jirito-state'));
  147 |     expect(stored).toBeDefined();
  148 |     const parsed = JSON.parse(stored);
  149 |     expect(parsed && parsed.issues && parsed.issues.some(i => i.title === 'Offline Test Issue')).toBe(true);
  150 |   });
  151 | });
  152 | 
```