import { desktopHarness } from './desktop-harness.mjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const h = await desktopHarness('model-preview', process.argv[2]);
const checks = [];
let p;
async function instrument() {
  await p.addInitScript(() => {
    window.previewStats = { webglContexts: 0, encodes: 0 };
    const seen = new WeakSet(), context = HTMLCanvasElement.prototype.getContext, encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const result = context.call(this, type, ...args);
      if ((type === 'webgl2' || type === 'webgl') && result && !seen.has(this)) { seen.add(this); window.previewStats.webglContexts++; }
      return result;
    };
    HTMLCanvasElement.prototype.toBlob = function (...args) { window.previewStats.encodes++; return encode.apply(this, args); };
  });
}
try {
  p = await h.start();
  const invoke = (command, args) => p.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const source = fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/jony-j-24.ateliermodel', import.meta.url));
  await writeFile(`${h.directory}/model-selection.txt`, source);
  const prepared = await invoke('model_choose');
  await invoke('library_create', { request: {
    requestId: crypto.randomUUID(), existingEditionId: null, cover: null, model: null, modelToken: prepared.token,
    edition: { categoryId: 'music', title: '24时', creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: 'cd', label: '' }] },
    copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
  } });
  await invoke('model_release', { token: prepared.token });
  await instrument(); await p.reload();
  const model = p.locator('.record-sleeve[data-current="true"] .model-view');
  await h.expect(model.locator('.model-preview[data-rendered="false"]')).toHaveCount(1);
  await model.locator('.model-preview').evaluate(image => image.decode());
  await h.expect(model).toHaveAttribute('data-loaded', 'false');
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/cold-cover.png` });
  await h.expect(model).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await h.expect(model.locator('.model-host')).toHaveCSS('opacity', '1');
  await h.expect(model.locator('.model-fallback')).toHaveCSS('opacity', '0');
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/cold-model.png` });
  await h.expect(model.locator('.model-preview[data-rendered="true"]')).toHaveCount(1, { timeout: 15000 });
  const cold = await p.evaluate(() => ({ stats: window.previewStats, measures: performance.getEntriesByType('measure').filter(e => e.name.startsWith('model.')).map(e => ({ stage: e.name, start: e.startTime, ms: e.duration })) }));
  assert.equal(cold.stats.webglContexts, 1); assert.equal(cold.stats.encodes, 1);
  const mount = cold.measures.find(e => e.stage === 'model.display_mount');
  const capture = cold.measures.find(e => e.stage === 'model.preview_capture');
  assert.ok(capture.start >= mount.start + mount.ms + 300);
  checks.push('首帧显示后空闲捕获一次无损预览，只创建一个 WebGL 上下文');
  checks.push('单独保存首次原始封面与模型的截图；不以缓存对比替代首次切换验收');
  await p.reload();
  await h.expect(model.locator('.model-preview[data-rendered="true"]')).toHaveCount(1);
  await h.expect(model).toHaveAttribute('data-loaded', 'false');
  await model.locator('.model-preview').evaluate(image => image.decode());
  const previewReadyMs = await p.evaluate(() => performance.now());
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/cached-preview.png` });
  await h.expect(model).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await h.expect(model.locator('.model-host')).toHaveCSS('opacity', '1');
  await h.expect(model.locator('.model-fallback')).toHaveCSS('opacity', '0');
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/live-model.png` });
  const bounds = await model.evaluate(node => {
    const a = node.querySelector('.model-preview').getBoundingClientRect(), b = node.querySelector('canvas').getBoundingClientRect();
    return { preview: { x: a.x, y: a.y, width: a.width, height: a.height }, canvas: { x: b.x, y: b.y, width: b.width, height: b.height } };
  });
  for (const key of Object.keys(bounds.preview)) assert.ok(Math.abs(bounds.preview[key] - bounds.canvas[key]) < 1, key);
  await p.waitForTimeout(800);
  const warm = await p.evaluate(() => window.previewStats);
  assert.equal(warm.encodes, 0); assert.equal(warm.webglContexts, 1);
  checks.push('重载后先显示缓存预览，预览与画布四边对齐，原分辨率足够时不重复生成');
  await p.evaluate(() => { window.originalPreviewCanvas = document.querySelector('canvas'); });
  await p.getByRole('button', { name: '取出 24时', exact: true }).click();
  await h.expect(p.locator('.interactive[data-loaded="true"]')).toBeVisible();
  await p.getByRole('button', { name: '放回', exact: true }).click();
  await h.expect(p.getByRole('dialog', { name: '收藏详情' })).not.toBeVisible();
  for (let i = 0; i < 3; i++) {
    await p.getByRole('button', { name: '取出 24时', exact: true }).click();
    await p.waitForTimeout(60); await p.keyboard.press('Escape');
    await h.expect(p.getByRole('dialog', { name: '收藏详情' })).not.toBeVisible();
    assert.equal(await p.evaluate(() => document.querySelector('canvas') === window.originalPreviewCanvas), true);
  }
  assert.deepEqual(await p.evaluate(() => window.previewStats), { webglContexts: 1, encodes: 0 });
  checks.push('正常比例下取出放回、三次中途反向返回均复用原画布，不触发新的上下文或预览编码');
  await p.getByRole('button', { name: '取出 24时', exact: true }).click();
  await h.expect(p.locator('.interactive[data-loaded="true"]')).toBeVisible();
  await p.locator('.interactive canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await h.expect(p.locator('.model-error')).toBeVisible();
  await h.expect(p.locator('.model-fallback')).toHaveCSS('opacity', '1');
  await h.expect(p.locator('.model-preview[data-rendered="true"]')).toBeVisible();
  checks.push('显卡上下文丢失时仍显示已缓存的同视角预览');
  await h.stop(); p = await h.start();
  await h.expect(p.locator('.model-preview[data-rendered="true"]')).toHaveCount(1);
  checks.push('关闭并重启测试进程后预览缓存仍可读取');
  assert.deepEqual(h.errors, []);
  await writeFile(`${h.directory}/results.json`, JSON.stringify({ checks, cold, warm, previewReadyMs, bounds, errors: h.errors }, null, 2));
  console.log(JSON.stringify({ directory: h.directory, checks, cold, warm, previewReadyMs, bounds }));
} catch (error) {
  await p?.screenshot({ path: `${h.directory}/failure.png` }).catch(() => {});
  await writeFile(`${h.directory}/failure.json`, JSON.stringify({ checks, error: String(error), errors: h.errors }, null, 2));
  throw error;
} finally { await h.stop(); }
