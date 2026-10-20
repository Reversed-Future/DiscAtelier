import { desktopHarness } from './desktop-harness.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const harness = await desktopHarness('discogs', process.argv[2]);
const { expect, directory, errors } = harness;
let page;
async function open() {
  await page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }).click();
  return page.getByRole('dialog', { name: 'Discogs', exact: true });
}
try {
  page = await harness.start();
  // This command operates on the explicitly isolated integration-test vault entry.
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('discogs_forget_token'));
  let dialog = await open();
  await dialog.getByRole('textbox', { name: 'Discogs 搜索内容', exact: true }).fill('000123');
  await dialog.getByRole('button', { name: '查询', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('请先配置 Discogs Token');
  await dialog.getByRole('combobox', { name: 'Discogs 搜索方式', exact: true }).click();
  await page.getByRole('option', { name: '发行 ID', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Discogs 搜索内容', exact: true }).fill('249504');
  await dialog.getByRole('button', { name: '查询', exact: true }).click();
  await expect(dialog.locator('.release-preview h3')).toHaveText('Never Gonna Give You Up', { timeout: 25000 });
  await expect(dialog.locator('.release-preview')).toContainText('PB 41447');
  await dialog.locator('.identifier-toggle').click();
  await expect(dialog.locator('.release-preview')).toContainText('5012394144777');
  await dialog.locator('.identifier-toggle').click();
  await expect.poll(() => dialog.evaluate(node => getComputedStyle(node).scrollbarWidth)).toBe('none');
  await expect(dialog.locator('.source-attribution')).toHaveAttribute('href', 'https://www.discogs.com/release/249504');
  await expect(dialog.locator('.track-list > li')).toHaveCount(2);
  const before = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('library_list', { query: { categoryId: 'music', status: null, query: '' } }));
  assert.equal(before.copies.length, 0);
  const session = await page.context().newCDPSession(page);
  const screen = await session.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${directory}/release-preview.png`, Buffer.from(screen.data, 'base64'));
  await session.detach();
  await dialog.getByRole('button', { name: '返回搜索', exact: true }).click();
  await dialog.getByRole('button', { name: '设置', exact: true }).click();
  let settings = page.getByRole('dialog', { name: 'Discogs 设置', exact: true });
  await settings.getByLabel('个人 Token', { exact: true }).fill('discatelier-integration-test-only');
  await settings.getByRole('button', { name: '保存 Token', exact: true }).click();
  await expect(settings.getByRole('button', { name: '移除 Token', exact: true })).toBeVisible();
  assert.equal(await page.locator('body').innerText().then(text => text.includes('discatelier-integration-test-only')), false);
  await harness.stop(); page = await harness.start();
  dialog = await open();
  await dialog.getByRole('button', { name: '设置', exact: true }).click();
  settings = page.getByRole('dialog', { name: 'Discogs 设置', exact: true });
  await expect(settings.getByLabel('个人 Token', { exact: true })).toHaveValue('');
  await settings.getByRole('button', { name: '移除 Token', exact: true }).click();
  await expect(settings.getByRole('button', { name: '移除 Token', exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('discogs_configured')), false);
  await dialog.getByRole('combobox', { name: 'Discogs 搜索方式', exact: true }).click();
  await page.getByRole('option', { name: '发行 ID', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Discogs 搜索内容', exact: true }).fill('249504');
  await dialog.getByRole('button', { name: '查询', exact: true }).click();
  await expect(dialog.locator('.release-preview h3')).toHaveText('Never Gonna Give You Up', { timeout: 25000 });
  await dialog.getByRole('button', { name: '选择此版本', exact: true }).click();
  const form = page.getByRole('dialog', { name: '添加收藏', exact: true });
  await expect(form.getByRole('textbox', { name: '品番', exact: true })).toHaveValue('PB 41447');
  await expect(form.locator('.cover-preview img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/, { timeout: 25000 });
  await form.getByRole('button', { name: '下一步', exact: true }).click();
  await form.getByRole('button', { name: '加入收藏', exact: true }).click();
  await expect(page.locator('.record-caption h1')).toHaveText('Never Gonna Give You Up');
  await harness.stop(); page = await harness.start();
  const imported = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('library_list', { query: { categoryId: 'music', status: null, query: '5012394144777' } }));
  assert.equal(imported.copies.length, 1);
  assert.equal(imported.copies[0].source.externalId, '249504');
  assert.ok(imported.copies[0].coverAssetId);
  await expect(page.locator('.record-sleeve img')).toBeVisible();
  const savedCover = await page.evaluate(assetId => window.__TAURI_INTERNALS__.invoke('library_cover', { assetId }), imported.copies[0].coverAssetId);
  assert.ok(savedCover.startsWith('data:image/jpeg;base64,'));
  assert.deepEqual(errors, []);
  const results = { passed: true, directory, errors, liveReleaseId: 249504, coverAssetId: imported.copies[0].coverAssetId, checks: ['live anonymous release over Rust HTTP', 'source identifiers/formats/tracks', 'preview does not write collection', 'missing search credential', 'Windows vault save/restart/remove in settings without token readback', 'real release import and restart with source identity', 'real primary artwork downloaded and stored with collection'], authenticatedSearch: 'requires user token; not executed' };
  await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  if (page) { await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {}); console.error(await page.locator('body').innerText().catch(() => '')); }
  throw error;
} finally {
  // Clear only this tool-created test credential, even if a later assertion failed.
  await page?.evaluate(() => window.__TAURI_INTERNALS__.invoke('discogs_forget_token')).catch(() => {});
  await harness.stop();
}
