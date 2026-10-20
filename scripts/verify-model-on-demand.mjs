import { desktopHarness } from './desktop-harness.mjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const h = await desktopHarness('model-on-demand', process.argv[2]);
const checks = [], requests = [];
let p;
async function recordFrames() {
  await p.evaluate(() => {
    window.fadeFrames = []; window.recordFade = true;
    const tick = () => {
      if (!window.recordFade) return;
      const model = document.querySelector('.model-view');
      const dialog = document.querySelector('.inspection-dialog');
      const opacity = selector => {
        const node = dialog?.querySelector(selector);
        return node ? Number(getComputedStyle(node).opacity) : null;
      };
      if (model) window.fadeFrames.push({
        time: performance.now(), exiting: dialog?.hasAttribute('data-exiting') || false,
        button: opacity('.return-button'), info: opacity('.object-info'),
        visible: model.dataset.visible,
        host: Number(getComputedStyle(model.querySelector('.model-host')).opacity),
        cover: Number(getComputedStyle(model.querySelector('.model-fallback')).opacity),
        canvases: document.querySelectorAll('canvas').length,
      });
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
}
async function finishFrames() {
  return p.evaluate(() => { window.recordFade = false; return window.fadeFrames; });
}
try {
  p = await h.start();
  const invoke = (command, args) => p.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  await writeFile(`${h.directory}/model-selection.txt`, fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/jony-j-24.ateliermodel', import.meta.url)));
  const prepared = await invoke('model_choose');
  await invoke('library_create', { request: {
    requestId: crypto.randomUUID(), existingEditionId: null, cover: null, model: null, modelToken: prepared.token,
    edition: { categoryId: 'music', title: '24时', creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: 'cd', label: '' }] },
    copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
  } });
  await invoke('model_release', { token: prepared.token });
  p.on('request', request => { if (new URL(request.url()).hostname === 'collection-model.localhost') requests.push(request.url()); });
  await p.addInitScript(() => {
    window.modelStats = { encodes: 0, contexts: 0 };
    const contexts = new WeakSet(), getContext = HTMLCanvasElement.prototype.getContext, toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const result = getContext.call(this, type, ...args);
      if (result && (type === 'webgl2' || type === 'webgl') && !contexts.has(this)) { contexts.add(this); window.modelStats.contexts++; }
      return result;
    };
    HTMLCanvasElement.prototype.toBlob = function(...args) { window.modelStats.encodes++; return toBlob.apply(this,args); };
  });
  await p.reload();
  const model = p.locator('.model-view'), dialog = p.getByRole('dialog', { name: '收藏详情' });
  await model.locator('img.model-preview').evaluate(image => image.decode());
  await p.waitForTimeout(1000);
  assert.equal(requests.length, 0);
  await h.expect(p.locator('canvas')).toHaveCount(0);
  assert.deepEqual(await p.evaluate(() => window.modelStats), { contexts: 0, encodes: 0 });
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/shelf-cover.png` });
  checks.push('浏览陈列不读取完整模型、不创建 WebGL、不生成预览');

  await recordFrames();
  await p.getByRole('button', { name: '取出 24时', exact: true }).click();
  await h.expect(dialog).toBeVisible();
  await h.expect(model).toHaveAttribute('data-loaded', 'false');
  await h.expect(model.locator('.model-fallback')).toHaveCSS('opacity','1');
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/opening-cover.png` });
  await h.expect(model).toHaveAttribute('data-visible', 'true', { timeout: 60000 });
  await h.expect(model.locator('.model-host')).toHaveCSS('opacity','1');
  await h.expect(model.locator('.model-fallback')).toHaveCSS('opacity','0');
  const opening = await finishFrames();
  assert.ok(opening.some(frame => frame.host > 0 && frame.host < 1));
  assert.ok(opening.every(frame => frame.canvases <= 1));
  assert.equal(requests.length, 1);
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/inspection-model.png` });
  checks.push('点击后加载，等待期间封面保留，模型首帧完成后 180 ms 淡入');

  await recordFrames();
  await p.getByRole('button', { name: '放回', exact: true }).click();
  await h.expect(dialog).not.toBeVisible();
  const closing = await finishFrames();
  assert.ok(closing.some(frame => frame.visible === 'false' && frame.host > 0 && frame.host < 1 && frame.cover > 0));
  for (const key of ['button','info']) {
    const samples = closing.filter(frame => frame.exiting && frame[key] !== null);
    assert.ok(samples.some(frame => frame[key] > 0 && frame[key] < 1), `${key}: actual exit fade`);
    assert.ok(samples.some(frame => frame[key] === 0), `${key}: hidden before dialog unmount`);
    for (let i = 1; i < samples.length; i++) assert.ok(samples[i][key] <= samples[i-1][key] + .001, `${key}: no rebound`);
  }
  checks.push('返回按钮与整个资料区实际逐帧淡出，在弹窗卸载前已透明，退出途中不回弹');
  await h.expect(p.locator('canvas')).toHaveCount(0);
  await h.expect(model.locator('.model-fallback')).toHaveCSS('opacity','1');
  await p.locator('.shared-artwork').screenshot({ path: `${h.directory}/returned-cover.png` });
  checks.push('放回过程中模型淡出、封面淡入，回到陈列后释放画布');

  for (let i = 0; i < 3; i++) {
    await p.getByRole('button', { name: '取出 24时', exact: true }).click();
    await p.waitForTimeout(60);
    await p.keyboard.press('Escape');
    await h.expect(dialog).not.toBeVisible();
    await h.expect(p.locator('canvas')).toHaveCount(0);
    await h.expect(model).toHaveAttribute('data-visible','false');
  }
  await p.waitForTimeout(800);
  await h.expect(p.locator('canvas')).toHaveCount(0);
  checks.push('连续三次加载中返回无迟到模型闪回，陈列保持封面');

  await p.emulateMedia({ reducedMotion: 'reduce' });
  await h.expect(model.locator('.model-host')).toHaveCSS('transition-duration','0s');
  assert.equal(await p.evaluate(() => window.modelStats.encodes), 0);
  assert.deepEqual(h.errors, []);
  const result = { checks, requests: requests.length, stats: await p.evaluate(() => window.modelStats), opening, closing, errors: h.errors };
  await writeFile(`${h.directory}/results.json`, JSON.stringify(result,null,2));
  console.log(JSON.stringify({ directory: h.directory, checks, stats: result.stats }));
} catch (error) {
  await p?.screenshot({ path: `${h.directory}/failure.png` }).catch(() => {});
  await writeFile(`${h.directory}/failure.json`, JSON.stringify({ checks, errors: h.errors, error: String(error) },null,2));
  throw error;
} finally { await h.stop(); }
