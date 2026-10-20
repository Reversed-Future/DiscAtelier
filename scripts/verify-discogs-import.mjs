import { desktopHarness } from './desktop-harness.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Artificial releases with field types verified by the provider contract. No real user credentials.
const release = {
  id: 910001, title: 'Import fixture', artists: [{ name: 'Fixture Artist', anv: '', join: '' }],
  formats: [{ name: 'CD', qty: '2', descriptions: ['Album'], text: '' }, { name: 'Blu-ray', qty: '1', descriptions: [], text: '' }, { name: 'Box Set', qty: '1', descriptions: [], text: '' }],
  labels: [{ name: 'Label A', catno: 'Ab-01' }, { name: 'Label B', catno: 'bB-02' }],
  identifiers: [{ type: 'Barcode', value: '000123', description: '' }, { type: 'Barcode', value: '0 00123', description: 'Text' }],
  tracklist: [{ position: '1-1', type_: 'track', title: 'Fixture track', duration: '3:00' }],
  country: 'JP', released: '2020-00-00',
  images: [{ type: 'secondary', uri: 'https://i.discogs.com/back.png', uri150: '' }, { type: 'primary', uri: 'https://i.discogs.com/cover.png', uri150: '' }],
};
const alternate = { ...release, images: [], id: 910002, title: 'Alternate fixture', formats: [{ name: 'Unmapped fixture format', qty: '1', descriptions: [], text: '' }] };
const coverBytes = await readFile(new URL('../apps/desktop/src-tauri/icons/icon.png', import.meta.url));
const coverId = createHash('sha256').update(coverBytes).digest('hex');
let coverRequests = 0;
const requests = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), authorization: req.headers.authorization === 'Discogs token=fixture-only-token' });
  if (url.pathname === '/cover.png') {
    coverRequests++;
    assert.equal(req.headers.authorization, undefined);
    if (coverRequests === 1) return res.writeHead(503).end();
    if (coverRequests === 2) return res.writeHead(200).end('invalid-image');
    return res.writeHead(200, { 'Content-Type': 'image/png' }).end(coverBytes);
  }
  let result;
  if (url.pathname === '/database/search') {
    result = { pagination: { page: Number(url.searchParams.get('page')), pages: 2, items: 3 },
      results: (url.searchParams.get('page') === '2' ? [alternate] : [release, alternate]).map(item => ({
        id: item.id, type: 'release', title: item.title, country: item.country, year: '2020', catno: 'Ab-01', format: item.formats.map(format => format.name),
      })) };
  } else if (url.pathname === '/releases/910001') result = release;
  else if (url.pathname === '/releases/910002') result = alternate;
  else { res.writeHead(404).end('{}'); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const harness = await desktopHarness('discogs-import', process.argv[2], { DISCATELIER_TEST_DISCOGS_PORT: String(server.address().port) });
const { expect, directory, errors } = harness;
let page;
const invoke = (command, args) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
const list = (query = '') => invoke('library_list', { query: { categoryId: 'music', status: null, query } });
async function open() {
  await page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }).click();
  return page.getByRole('dialog', { name: 'Discogs', exact: true });
}
async function search(dialog, mode, query) {
  await dialog.getByRole('combobox', { name: 'Discogs 搜索方式', exact: true }).click();
  await page.getByRole('option', { name: mode, exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Discogs 搜索内容', exact: true }).fill(query);
  await dialog.getByRole('button', { name: '查询', exact: true }).click();
  await expect(dialog.locator('.metadata-results article')).toHaveCount(2, { timeout: 15000 });
}
async function choose(dialog, title) {
  await dialog.locator('.metadata-results article > button').filter({ hasText: title }).click();
  await expect(dialog.locator('.release-preview h3')).toHaveText(title, { timeout: 15000 });
  await dialog.getByRole('button', { name: '选择此版本', exact: true }).click();
}
async function screenshot(name) {
  const session = await page.context().newCDPSession(page);
  const image = await session.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${directory}/${name}.png`, Buffer.from(image.data, 'base64'));
  await session.detach();
}
try {
  page = await harness.start();
  await invoke('discogs_save_token', { token: 'fixture-only-token' });
  let dialog = await open();
  await search(dialog, '条码', '000123');
  await screenshot('versions');
  // Pagination and returning from a release preserve the exact search and page.
  await dialog.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(dialog.locator('.metadata-pagination')).toContainText('2 / 2', { timeout: 15000 });
  await dialog.locator('.metadata-results article > button').click();
  await expect(dialog.locator('.release-preview h3')).toHaveText('Alternate fixture', { timeout: 15000 });
  await dialog.getByRole('button', { name: '返回搜索', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Discogs 搜索内容', exact: true })).toHaveValue('000123');
  await expect(dialog.locator('.metadata-pagination')).toContainText('2 / 2');
  await dialog.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(dialog.locator('.metadata-results article')).toHaveCount(2, { timeout: 15000 });
  await choose(dialog, 'Import fixture');
  await expect(dialog.getByRole('alert')).toContainText('封面暂时无法下载');
  assert.equal((await list()).copies.length, 0);
  await dialog.getByRole('button', { name: '选择此版本', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('封面格式无效');
  assert.equal((await list()).copies.length, 0);
  await dialog.getByRole('button', { name: '选择此版本', exact: true }).click();
  let form = page.getByRole('dialog', { name: '添加收藏', exact: true });
  await expect(form.locator('.cover-preview img')).toHaveAttribute('src', `data:image/png;base64,${coverBytes.toString('base64')}`);
  await expect(form.getByRole('textbox', { name: '条码', exact: true })).toHaveValue('000123');
  await expect(form.locator('.medium-row')).toHaveCount(3);
  await expect(form.getByRole('combobox', { name: '第 3 张载体', exact: true })).toHaveText('BD');
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 960, height: 680 } } }));
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Control+=');
    const expected = [768, 640, 548, 480][index];
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(expected);
  }
  assert.equal(await form.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  await form.getByRole('textbox', { name: '名称', exact: true }).fill('My confirmed title');
  await form.getByRole('button', { name: '下一步', exact: true }).click();
  await form.getByRole('textbox', { name: '价格', exact: true }).fill('12.00');
  await form.getByRole('textbox', { name: '购入位置', exact: true }).fill('Shop A');
  for (let index = 0; index < 35; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await form.evaluate(node => node.contains(document.activeElement)), true);
  }
  await form.getByRole('button', { name: '加入收藏', exact: true }).focus();
  await expect(form.getByRole('button', { name: '加入收藏', exact: true })).toBeInViewport();
  await screenshot('purchase');
  await form.getByRole('button', { name: '加入收藏', exact: true }).click();
  await expect(page.locator('.record-caption h1')).toHaveText('My confirmed title');
  await page.keyboard.press('Control+0');
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(960);
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1440, height: 960 } } }));
  let snapshot = await list();
  assert.equal(snapshot.copies.length, 1);
  assert.equal(snapshot.copies[0].coverAssetId, coverId);
  await expect(page.locator('.record-sleeve img')).toBeVisible();
  assert.equal(snapshot.mediumCount, 3);
  const firstEdition = snapshot.copies[0].editionId;
  assert.equal(snapshot.copies[0].source.externalId, '910001');
  assert.equal((await list('0 00123')).copies.length, 1);
  assert.equal((await list('bB-02')).copies.length, 1);
  assert.equal((await list('BB-02')).copies.length, 0);

  dialog = await open();
  await search(dialog, '品番', 'Ab-01');
  await choose(dialog, 'Import fixture');
  form = page.getByRole('dialog', { name: '再收一套', exact: true });
  await expect(form).toContainText('My confirmed title');
  await expect(form).toContainText('已收藏 1 套');
  await form.getByRole('textbox', { name: '价格', exact: true }).fill('23.00');
  await form.getByRole('textbox', { name: '购入位置', exact: true }).fill('Shop B');
  await form.getByRole('button', { name: '加入收藏', exact: true }).click();
  await expect(page.locator('.record-counter')).toHaveText('01 / 02');
  snapshot = await list();
  assert.equal(snapshot.amounts.CNY, '3500');
  assert.ok(snapshot.copies.every(copy => copy.editionId === firstEdition && copy.edition.title === 'My confirmed title'));
  assert.ok(snapshot.copies.every(copy => copy.coverAssetId === coverId));
  assert.equal(coverRequests, 3);
  assert.deepEqual(snapshot.copies.map(copy => copy.copy.seller).sort(), ['Shop A', 'Shop B']);
  const backup = await invoke('library_backup');

  dialog = await open();
  await search(dialog, '品番', 'Ab-01');
  await choose(dialog, 'Alternate fixture');
  form = page.getByRole('dialog', { name: '添加收藏', exact: true });
  await form.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('请选择每张盘片的载体');
  await form.getByRole('combobox', { name: '第 1 张载体', exact: true }).click();
  await page.getByRole('option', { name: '其他', exact: true }).click();
  await form.getByRole('button', { name: '下一步', exact: true }).click();
  await form.getByRole('combobox', { name: '状态', exact: true }).click();
  await page.getByRole('option', { name: '想购入', exact: true }).click();
  await form.getByRole('textbox', { name: '购买链接', exact: true }).fill('https://example.invalid/fixture');
  await form.getByRole('button', { name: '加入收藏', exact: true }).click();
  await expect(page.locator('.record-counter')).toHaveText('01 / 03');
  snapshot = await list();
  assert.equal(snapshot.mediumCount, 7);
  assert.equal(snapshot.ownedCount, 2);
  assert.equal(snapshot.amounts.CNY, '3500');
  assert.equal(new Set(snapshot.copies.map(copy => copy.editionId)).size, 2);
  const alternateCopy = snapshot.copies.find(copy => copy.source.externalId === '910002');
  assert.equal(alternateCopy.coverAssetId, null);
  assert.equal(alternateCopy.copy.status, 'wanted');
  assert.equal(alternateCopy.copy.purchaseUrl, 'https://example.invalid/fixture');
  await screenshot('collection');
  await harness.stop(); page = await harness.start();
  assert.equal((await list()).copies.length, 3);
  const preview = await invoke('library_prepare_restore', { path: backup });
  await invoke('library_restore', { token: preview.token });
  assert.equal((await list()).copies.length, 2);
  assert.equal((await list('bB-02')).copies.length, 2);
  await harness.stop(); page = await harness.start();
  assert.equal((await list()).copies.length, 2);
  assert.ok(requests.some(request => request.query.barcode === '000123' && request.authorization));
  assert.equal(await invoke('library_cover', { assetId: coverId }), `data:image/png;base64,${coverBytes.toString('base64')}`);
  assert.ok((await list()).copies.every(copy => copy.coverAssetId === coverId));
  assert.equal(coverRequests, 3);
  assert.ok(requests.some(request => request.query.catno === 'Ab-01' && request.authorization));
  assert.ok(requests.every(request => !Object.values(request.query).includes('fixture-only-token')));
  assert.deepEqual(errors, []);
  const results = { passed: true, directory, errors, fixtureOnly: true, requests,
    checks: ['barcode and exact catalog through Rust HTTP', 'version selection and pagination/back state', 'CD/CD/BD without packaging disc', 'unknown format explicit selection', 'independent purchases and reuse of same release', 'different release separation', 'all identifiers searchable', 'local edited title preserved', 'wanted status and purchase URL', 'backup/restore/restart', 'import form 200% at minimum window with Tab containment', 'primary cover automatic download, preview, persistence and backup/restore', 'failed and corrupt images do not write collection; retry succeeds', 'same edition keeps cover without re-download; missing artwork uses default; image HTTP has no token'] };
  await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  if (page) { await screenshot('failure').catch(() => {}); console.error(await page.locator('body').innerText().catch(() => '')); }
  throw error;
} finally {
  await invoke('discogs_forget_token').catch(() => {});
  await harness.stop();
  await new Promise(resolve => server.close(resolve));
}
