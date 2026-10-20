import { desktopHarness } from './desktop-harness.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const harness = await desktopHarness('models', process.argv[2]);
const { expect, directory, errors } = harness;
const packages = fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/', import.meta.url));
const hinge = `${packages}/example-hinge.ateliermodel`;
const drawer = `${packages}/example-drawer.ateliermodel`;
const checks = [];
let page;
const invoke = (command, args = {}) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
const list = async () => (await invoke('library_list', { query: { categoryId: 'music', status: null, query: '' } })).copies;
async function inspect(title) {
  await page.getByRole('button', { name: `取出 ${title}`, exact: true }).click();
  await expect(page.locator('.interactive[data-loaded="true"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.interactive .model-host')).toHaveCSS('opacity', '1');
  await expect(page.locator('canvas')).toHaveCount(1);
}
async function edit(title) {
  await inspect(title);
  await page.getByRole('button', { name: '编辑版本', exact: true }).click();
}
async function selectModel(path) {
  await writeFile(`${directory}/model-selection.txt`, path);
  await page.locator('.model-file-actions button').first().click();
}
async function saveEdition() {
  await page.getByRole('button', { name: '保存版本', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑版本', exact: true })).not.toBeVisible({ timeout: 60000 });
}
async function loaded() {
  await expect(page.locator('.record-sleeve .model-view[data-loaded="true"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.record-sleeve .model-host')).toHaveCSS('opacity', '1');
}
async function shot(name) { await page.screenshot({ path: `${directory}/${name}.png` }); }
try {
  page = await harness.start();
  await page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }).click();
  await page.getByRole('button', { name: '手动录入', exact: true }).click();
  const form = page.getByRole('dialog', { name: '添加收藏', exact: true });
  await form.getByRole('textbox', { name: '名称', exact: true }).fill('模型测试');
  await form.getByLabel('封面文件', { exact: true }).setInputFiles(fileURLToPath(new URL('../apps/desktop/src-tauri/icons/32x32.png', import.meta.url)));
  await selectModel(hinge);
  await expect(form.locator('.model-file-title')).toHaveText('翻盖纪念盒');
  await form.getByRole('button', { name: '下一步', exact: true }).click();
  await form.getByRole('button', { name: '加入收藏', exact: true }).click();
  await expect(form).not.toBeVisible();
  await loaded(); await shot('shelf-hinge');
  const first = (await list())[0];
  assert(first.modelAssetId && first.coverAssetId);
  assert.equal(await invoke('library_model', { assetId: first.modelAssetId, preview: false }), await readFile(hinge, 'utf8'));
  checks.push('上传与版本原子保存，模型和封面分别保留，收藏页显示真实 WebGL');
  await inspect('模型测试'); await shot('inspection-hinge');
  const canvas = page.locator('.interactive canvas');
  await canvas.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('+');
  await expect(canvas).toBeFocused();
  await canvas.click({ position: { x: (await canvas.boundingBox()).width / 2, y: (await canvas.boundingBox()).height / 2 } });
  await expect(page.locator('.interactive')).toHaveAttribute('data-model-state', 'opened', { timeout: 10000 });
  await expect(page.getByRole('button', { name: '合上盒盖', exact: true })).toBeEnabled({ timeout: 10000 });
  await shot('hinge-open');
  await page.getByRole('button', { name: '合上盒盖', exact: true }).click();
  await expect(page.locator('.interactive')).toHaveAttribute('data-model-state', 'closed', { timeout: 10000 });
  await expect(page.getByRole('button', { name: '放回', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape'); await loaded();
  checks.push('模型点击展开、按原路径合上、键盘旋转缩放、退出回到收藏');
  const backup = await invoke('library_backup');
  await edit('模型测试');
  await selectModel(drawer);
  await expect(page.locator('.model-file-title')).toHaveText('抽屉收藏盒');
  await saveEdition(); await loaded();
  assert.notEqual((await list())[0].modelAssetId, first.modelAssetId);
  await edit('模型测试');
  await page.getByRole('button', { name: '移除模型', exact: true }).click();
  await saveEdition();
  await expect(page.locator('.record-sleeve img')).toBeVisible();
  assert.equal((await list())[0].modelAssetId, null);
  assert.equal((await list())[0].coverAssetId, first.coverAssetId);
  checks.push('更换模型、移除模型恢复原封面');
  const preview = await invoke('library_prepare_restore', { path: backup });
  assert.equal(preview.models, 1);
  await invoke('library_restore', { token: preview.token });
  await page.reload(); await loaded();
  await harness.stop(); page = await harness.start(); await loaded();
  assert.equal((await list())[0].modelAssetId, first.modelAssetId);
  checks.push('模型随备份恢复，原生进程重启后保留');
  await edit('模型测试');
  await writeFile(`${directory}/invalid.ateliermodel`, '{}');
  await selectModel(`${directory}/invalid.ateliermodel`);
  await expect(page.locator('.model-field [role="alert"]')).toBeVisible();
  assert.equal((await list())[0].modelAssetId, first.modelAssetId);
  await page.keyboard.press('Escape'); await loaded();
  const invalid = JSON.parse(await readFile(hinge, 'utf8'));
  invalid.cover = 'https://example.com/external.png';
  const reject = await invoke('library_update_edition', { request: {
    requestId: crypto.randomUUID(), editionId: first.editionId, expectedRevision: first.editionRevision,
    edition: first.edition, cover: { action: 'keep' }, model: { action: 'replace', text: JSON.stringify(invalid) },
  } }).then(() => false, () => true);
  assert(reject);
  assert.equal((await list())[0].modelAssetId, first.modelAssetId);
  checks.push('损坏模型与外链贴图拒绝，旧模型不被覆盖');
  // Large authored album, no content copied to the repository.
  await edit('模型测试');
  const largeStart = Date.now();
  await selectModel(`${packages}/jony-j-24.ateliermodel`);
  await expect(page.locator('.model-file-title')).toHaveText('24时', { timeout: 30000 });
  console.log(`large model validated: ${Date.now() - largeStart} ms`);
  await expect(page.getByRole('button', { name: '保存版本', exact: true })).toBeEnabled({ timeout: 30000 });
  await saveEdition(); console.log(`large model saved: ${Date.now() - largeStart} ms`);
  await loaded(); await shot('shelf-album');
  await inspect('模型测试'); await shot('inspection-album');
  checks.push(`32 MiB 完整唱片包上传和真实渲染（${Date.now() - largeStart} ms，含截图及陈列／检视）`);
  await page.keyboard.press('Escape'); await loaded();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '取出 模型测试', exact: true }).click();
    await page.getByRole('button', { name: '放回', exact: true }).click();
    await loaded(); await expect(page.locator('canvas')).toHaveCount(1);
  }
  checks.push('快速取出放回三次，返回后仅一个画布，无未处理错误');
  await inspect('模型测试');
  assert(await page.locator('.interactive canvas').evaluate(canvas => {
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext(); return true;
  }));
  await expect(page.locator('.interactive .model-fallback img')).toBeVisible();
  await expect(page.locator('.model-error')).toHaveText('模型显示中断，重新打开可重试。');
  await page.keyboard.press('Escape'); await loaded();
  checks.push('模拟显卡上下文丢失后恢复封面，重新打开可重试');
  // Native minimum size, 200% zoom, model import remains reachable.
  await invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 960, height: 680 } } });
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+='); await page.waitForTimeout(160); }
  await edit('模型测试');
  await expect(page.getByRole('button', { name: '更换模型', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '更换模型', exact: true }).focus();
  await expect(page.getByRole('button', { name: '更换模型', exact: true })).toBeFocused();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await shot('model-edit-200');
  await page.keyboard.press('Escape');
  checks.push('最小窗口 200% 编辑入口、焦点与无横向溢出');
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/results.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ directory, checks }, null, 2));
} catch (error) {
  await shot('failure').catch(() => {});
  await writeFile(`${directory}/failure.json`, JSON.stringify({ checks, errors, error: String(error) }, null, 2));
  throw error;
} finally { await harness.stop(); }
