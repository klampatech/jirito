import { chromium } from 'playwright';

const port = 9999;
const url = `http://127.0.0.1:${port}`;

const launchOpts = { headless: true, args: ['--no-sandbox'] };
const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// Light theme
const page1 = await browser.newPage();
await page1.goto(url, { waitUntil: 'networkidle' });
await page1.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'light');
  localStorage.setItem('jirito-theme', 'light');
});
await page1.waitForTimeout(500);
await page1.screenshot({ path: '/tmp/jirito-light-theme.png', fullPage: false });
console.log('Light theme screenshot saved to /tmp/jirito-light-theme.png');
await page1.close();

// Dark theme
const page2 = await browser.newPage();
await page2.goto(url, { waitUntil: 'networkidle' });
await page2.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('jirito-theme', 'dark');
});
await page2.waitForTimeout(500);
await page2.screenshot({ path: '/tmp/jirito-dark-theme.png', fullPage: false });
console.log('Dark theme screenshot saved to /tmp/jirito-dark-theme.png');
await page2.close();

await browser.close();
