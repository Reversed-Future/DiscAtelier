import { desktopHarness } from './desktop-harness.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Artificial search data and intercepted artwork, using the documented Discogs field names.
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/database/search') return res.writeHead(404).end('{}');
  const page = Number(url.searchParams.get('page'));
  const count = page === 1 ? 20 : 1;
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
    pagination: { page, pages: 2, items: 21 },
    results: Array.from({ length: count }, (_, index) => ({
      id: 920000 + index, type: 'release', title: `Search fixture ${index + 1}`,
      country: 'JP', year: '2020', catno: `TEST-${index}`, format: ['CD', 'Album'],
      thumb: index === 1 ? '' : `https://i.discogs.com/layout-test-${index}.png`,
      cover_image: index === 2 ? 'https://i.discogs.com/layout-fallback.png' : '',
    })),
  }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const harness = await desktopHarness('discogs-search-layout', process.argv[2], {
  DISCATELIER_TEST_DISCOGS_PORT: String(server.address().port),
});
const { expect, directory, errors } = harness;
let page;
const invoke = (command, args) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
async function screenshot(name) {
  const session = await page.context().newCDPSession(page);
  const image = await session.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${directory}/${name}.png`, Buffer.from(image.data, 'base64'));
  await session.detach();
}
try {
  page = await harness.start();
  const artwork = await readFile(new URL('../apps/desktop/src-tauri/icons/icon.png', import.meta.url));
  const imageRequests = [];
  await page.route('https://i.discogs.com/**', async route => {
    const request = route.request();
    imageRequests.push({ url: request.url(), authorization: request.headers().authorization ?? null });
    if (request.url().endsWith('layout-test-2.png') || request.url().endsWith('layout-test-3.png')) {
      await route.fulfill({ status: 404, body: '' });
    } else await route.fulfill({ status: 200, contentType: 'image/png', body: artwork });
  });
  await invoke('discogs_save_token', { token: 'fixture-only-token' });
  await page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }).click();
  await page.getByRole('button', { name: '手动录入', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '添加收藏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.empty-state').getByRole('button', { name: '添加收藏', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discogs', exact: true });
  const initialHeight = await dialog.evaluate(node => node.clientHeight);
  await dialog.getByRole('textbox', { name: 'Discogs 搜索内容' }).fill('fixture');
  await dialog.getByRole('button', { name: '查询', exact: true }).click();
  const articles = dialog.locator('.metadata-results article');
  await expect(articles).toHaveCount(20);
  await dialog.getByRole('button', { name: '设置', exact: true }).click();
  const connectionSettings = page.getByRole('dialog', { name: 'Discogs 设置', exact: true });
  await expect(connectionSettings.getByRole('button', { name: '移除 Token', exact: true })).toBeVisible();
  for (let index = 0; index < 15; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await connectionSettings.evaluate(node => node.contains(document.activeElement)), true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('textbox', { name: 'Discogs 搜索内容' })).toHaveValue('fixture');
  await expect(articles).toHaveCount(20);
  await expect(dialog.getByText('Data provided by Discogs.', { exact: true })).toHaveCount(0);
  assert.equal(await dialog.evaluate(node => node.clientHeight), initialHeight);
  await expect.poll(() => articles.nth(0).locator('img').evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  await expect(articles.nth(1).locator('.search-cover-empty')).toBeVisible();
  await expect(articles.nth(2).locator('img')).toHaveAttribute('src', 'https://i.discogs.com/layout-fallback.png');
  await expect(articles.nth(3).locator('.search-cover-empty')).toBeVisible();
  const list = dialog.getByRole('region', { name: '搜索结果' });
  assert.equal(await list.evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
  assert.equal(await dialog.evaluate(node => node.scrollHeight <= node.clientHeight + 1), true);
  await screenshot('search');
  await list.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => list.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await articles.last().locator('button').focus();
  await expect(articles.last().locator('button')).toBeInViewport();
  await dialog.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(articles).toHaveCount(1, { timeout: 15000 });
  assert.equal(await dialog.evaluate(node => node.clientHeight), initialHeight);
  assert.equal(await list.evaluate(node => node.scrollTop), 0);
  await dialog.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(articles).toHaveCount(20, { timeout: 15000 });
  await invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 960, height: 680 } } });
  for (const width of [768, 640, 548, 480]) {
    await page.keyboard.press('Control+=');
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  }
  assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1), true);
  await expect(list).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '下一页', exact: true })).toBeInViewport();
  await articles.last().locator('button').focus();
  await expect(articles.last().locator('button')).toBeInViewport();
  await screenshot('search-200');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '影像', exact: true }).click();
  await page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '添加收藏', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await expect(page.locator('#tools-popover').getByRole('button', { name: '备份收藏', exact: true })).toHaveCount(0);
  await expect(page.locator('#tools-popover').getByRole('button', { name: 'Discogs', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings.getByRole('button', { name: '备份收藏', exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: '恢复收藏', exact: true })).toBeVisible();
  assert.equal(await settings.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  await settings.getByRole('button', { name: 'Discogs', exact: true }).click();
  await expect(connectionSettings.getByLabel('个人 Token', { exact: true })).toBeVisible();
  await connectionSettings.getByRole('button', { name: '返回设置', exact: true }).click();
  await screenshot('settings-200');
  assert.ok(imageRequests.length > 0);
  assert.ok(imageRequests.every(request => request.authorization === null));
  assert.deepEqual(errors, []);
  const results = { passed: true, fixtureOnly: true, directory, errors, imageRequests,
    checks: ['fixed height before/after search and between result counts', 'hidden scrollbar with wheel and focus scrolling',
      'loaded/missing/failed/fallback artwork', 'no token sent with image requests', 'minimum window at 200% with visible pagination',
      'music add opens Discogs from toolbar and empty state', 'manual entry and video entry retained', 'no repeated source text in results',
      'settings groups credentials/backup/restore', 'nested settings traps focus and preserves search', 'settings usable at 200%'] };
  await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  if (page) await screenshot('failure').catch(() => {});
  throw error;
} finally {
  if (page) await invoke('discogs_forget_token').catch(() => {});
  await harness.stop();
  await new Promise(resolve => server.close(resolve));
}
