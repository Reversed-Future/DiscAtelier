import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Explicit local test dependency and browser paths; no implicit package lookup.
if (!process.argv[2] || !process.argv[3]) throw Error('Pass the Playwright module path and Chromium executable path.');
const { chromium, expect } = await import(pathToFileURL(process.argv[2]).href);
const { url } = JSON.parse(await readFile(new URL('../artifacts/preview.json', import.meta.url)));
const output = new URL('../artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
const checks = [];
async function settledScreenshot(page, filename, fullPage = false) {
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode()));
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: fileURLToPath(new URL(filename, output)), fullPage });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('.collection-card')).toHaveCount(8);
  await expect(page.locator('#total')).toHaveText('8');
  await settledScreenshot(page, 'shelf.png', true);
  checks.push('1440×960 shelf renders 8 referenced covers');
  await page.getByLabel('搜索收藏', { exact: true }).fill('Lemon');
  await expect(page.locator('.collection-card')).toHaveCount(1);
  await page.getByRole('button', { name: '查看 Lemon', exact: true }).click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await settledScreenshot(page, 'detail.png');
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
  checks.push('Search, detail and keyboard dismissal');
  await page.getByLabel('搜索收藏', { exact: true }).fill('');
  await page.getByRole('button', { name: '书脊', exact: true }).click();
  await expect(page.locator('#collection')).toHaveClass('collection spines');
  await settledScreenshot(page, 'spines.png');
  await page.getByRole('button', { name: '封面', exact: true }).click();
  await expect(page.locator('#collection')).toHaveClass('collection covers');
  await page.locator('[data-section="video"]').click();
  await expect(page.locator('.empty')).toBeVisible();
  checks.push('Spine and cover views; genuinely empty video section');
  await page.locator('#add').click();
  await page.locator('#add-form [name="title"]').fill('界面验证条目');
  await page.locator('#add-form [name="amount"]').fill('19.90');
  await page.locator('#add-form [name="seller"]').fill('测试店铺');
  await page.locator('#add-form [type="submit"]').click();
  await expect(page.locator('.collection-card')).toHaveCount(1);
  await expect(page.locator('#total')).toHaveText('1');
  await expect(page.locator('#cost')).toContainText('19.90');
  checks.push('Manual video item, default cover and exact amount aggregation');
  await page.getByLabel('收藏状态', { exact: true }).selectOption('wanted');
  await expect(page.locator('.collection-card')).toHaveCount(0);
  await page.locator('[data-section="music"]').click();
  await page.getByRole('button', { name: '陈列', exact: true }).click();
  await page.setViewportSize({ width: 980, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await settledScreenshot(page, 'compact.png', true);
  checks.push('980×800 compact layout without horizontal document overflow');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '查看 Lemon', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
  checks.push('Reduced motion detail closure');
  await page.reload();
  await expect(page.locator('.collection-card')).toHaveCount(8);
  assert.deepEqual(errors, []);
  checks.push('Refresh restores demonstration data; no page exceptions');
  await writeFile(new URL('ui-results.json', output), JSON.stringify({ checks, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
