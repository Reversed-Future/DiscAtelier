// Human/system-dialog automation companion. Never substitutes model_choose.
import { desktopHarness } from './desktop-harness.mjs';
import { copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const h = await desktopHarness('native-picker', process.argv[2]);
const checks = [];
try {
  const hinge = `${h.directory}/中文 翻盖.ateliermodel`;
  const drawer = `${h.directory}/中文 抽屉.ateliermodel`;
  const bad = `${h.directory}/损坏.ateliermodel`;
  await copyFile(fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/example-hinge.ateliermodel', import.meta.url)), hinge);
  await copyFile(fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/example-drawer.ateliermodel', import.meta.url)), drawer);
  await writeFile(bad, '{}');
  const p = await h.start();
  await p.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }).click();
  await p.getByRole('button', { name: '手动录入', exact: true }).click();
  async function open(instruction) {
    await p.locator('.model-file-actions button').first().click();
    console.log(instruction);
  }
  const title = p.locator('.model-file-title');
  await open('取消文件选择');
  await h.expect(p.getByRole('button', { name: '上传模型', exact: true })).toBeEnabled({ timeout: 300000 });
  checks.push('取消后恢复表单');
  await open(`选择 ${hinge}`);
  await h.expect(title).toHaveText('翻盖纪念盒', { timeout: 300000 });
  checks.push('中文与空格路径选择成功');
  await open(`选择 ${bad}`);
  await h.expect(p.locator('.model-field [role="alert"]')).toBeVisible({ timeout: 300000 });
  await h.expect(title).toHaveText('翻盖纪念盒');
  checks.push('损坏文件不覆盖原选择');
  await open(`选择 ${drawer}`);
  await h.expect(title).toHaveText('抽屉收藏盒', { timeout: 300000 });
  checks.push('失败后重试并更换成功');
  await open('取消更换');
  await h.expect(p.getByRole('button', { name: '更换模型', exact: true })).toBeEnabled({ timeout: 300000 });
  await h.expect(title).toHaveText('抽屉收藏盒');
  await p.keyboard.press('Escape');
  const list = await p.evaluate(() => window.__TAURI_INTERNALS__.invoke('library_list', { query: { categoryId: 'music', status: null, query: '' } }));
  assert.equal(list.copies.length, 0);
  checks.push('取消更换保留选择，关闭表单不入库');
  assert.deepEqual(h.errors, []);
  await writeFile(`${h.directory}/results.json`, JSON.stringify({ checks, errors: h.errors }, null, 2));
  console.log(JSON.stringify({ directory: h.directory, checks }));
} finally { await h.stop(); }
