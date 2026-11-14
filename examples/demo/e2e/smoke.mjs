/**
 * Browser smoke test for the demo: list renders with stored images, a rename shows the
 * non-modal "update the image?" prompt, Update swaps the image, and the settings panel
 * changes the video style. Screenshots go to the directory given as argv[2].
 * Usage: npm run build && npx vite preview --port 4317 & node e2e/smoke.mjs <outdir>
 */
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 980 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:4317/');
await page.waitForFunction(() => document.querySelectorAll('.row img').length >= 13 && [...document.querySelectorAll('.row span[data-status]')].every((s) => s.getAttribute('data-status') === 'ready'), null, { timeout: 15000 });
await page.waitForTimeout(1500); // podcast: placeholder, then the mock AI result
const stored = await page.locator('.type', { hasText: 'stored' }).count();
await page.screenshot({ path: `${out}/demo-list.png`, fullPage: true });
const srcBefore = await page.locator('.row').first().locator('img').getAttribute('src');
await page.locator('.row').first().getByRole('button', { name: 'Rename' }).click();
await page.getByLabel('New title').fill('Moon River');
await page.getByLabel('New title').press('Enter');
await page.locator('.toast').waitFor({ timeout: 5000 });
await page.screenshot({ path: `${out}/demo-rename-prompt.png` });
await page.locator('.toast').getByRole('button', { name: 'Update' }).click();
await page.waitForFunction((before) => document.querySelector('.row img')?.getAttribute('src') !== before, srcBefore, { timeout: 5000 });
await page.getByRole('button', { name: 'Thumbnail settings' }).click();
await page.locator('.settings select').first().waitFor({ timeout: 8000 });
const selects = await page.locator('.settings select').count();
const videoSelect = page.locator('.zodal-dials-field[data-key="sigil.style.video"] select');
const before = await page.locator('.row', { hasText: 'Launch keynote' }).locator('img').getAttribute('src');
await videoSelect.selectOption('grid@1');
await page.waitForFunction((b) => document.querySelector('.row:nth-child(5) img')?.getAttribute('src') !== b, before, { timeout: 5000 });
await page.screenshot({ path: `${out}/demo-settings.png`, fullPage: true });
console.log(JSON.stringify({ rows: await page.locator('.row').count(), stored, selects, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
