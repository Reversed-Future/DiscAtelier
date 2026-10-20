import { desktopHarness } from './desktop-harness.mjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const h = await desktopHarness('model-loading', process.argv[2]);
const checks = [];
let p;
try {
  p = await h.start();
  const invoke = (command, args) => p.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  for (const [file, title] of [['example-hinge.ateliermodel', '翻盖模型'], ['jony-j-24.ateliermodel', '大型模型']]) {
    await writeFile(`${h.directory}/model-selection.txt`, fileURLToPath(new URL(`../../AtelierPublisher/model-authoring/packages/${file}`, import.meta.url)));
    const model = await invoke('model_choose');
    await invoke('library_create', { request: {
      requestId: crypto.randomUUID(), existingEditionId: null, cover: null, model: null, modelToken: model.token,
      edition: { categoryId: 'music', title, creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: 'cd', label: '' }] },
      copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
    } });
    await invoke('model_release', { token: model.token });
  }
  await p.addInitScript(() => {
    // Slow transport deterministically; test worker termination without relying on machine load.
    window.__workerStats = { active: 0, terminated: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      stopped = false; timers = [];
      constructor(...args) { super(...args); window.__workerStats.active++; }
      postMessage(...args) { this.timers.push(setTimeout(() => { if (!this.stopped) super.postMessage(...args); }, 1000)); }
      terminate() {
        if (!this.stopped) { this.stopped = true; this.timers.forEach(clearTimeout); window.__workerStats.active--; window.__workerStats.terminated++; }
        super.terminate();
      }
    };
  });
  await p.reload();
  const current = p.locator('.record-sleeve[data-current="true"]');
  await h.expect(current).toHaveAttribute('aria-label', '取出 大型模型');
  await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'false');
  assert.equal(await current.locator('.model-fallback').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await current.locator('.model-host').evaluate(el => el.inert), true);
  await p.getByRole('button', { name: '选择 翻盖模型', exact: true }).click();
  await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await h.expect(current).toHaveAttribute('aria-label', '取出 翻盖模型');
  await h.expect(p.locator('canvas')).toHaveCount(1);
  assert.equal(await p.evaluate(() => window.__workerStats.active), 0);
  assert.ok(await p.evaluate(() => window.__workerStats.terminated >= 2));
  await h.expect(current.locator('.model-fallback')).toHaveCSS('opacity', '0');
  await h.expect(current.locator('.model-host')).toHaveCSS('opacity', '1');
  checks.push('加载时保留封面，首帧后交叉淡入，快速换模型取消旧 Worker且不闪回');
  await p.screenshot({ path: `${h.directory}/ready.png` });
  await p.getByRole('button', { name: '选择 大型模型', exact: true }).click();
  await p.getByRole('button', { name: '选择 翻盖模型', exact: true }).click();
  await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await h.expect(p.locator('canvas')).toHaveCount(1);
  assert.equal(await p.evaluate(() => window.__workerStats.active), 0);
  checks.push('快速往返复用已解析模型，取消的旧结果不覆盖当前收藏');
  await p.getByRole('button', { name: '选择 大型模型', exact: true }).click();
  await h.expect(current.locator('.model-view[data-loaded="false"] canvas')).toHaveCount(1, { timeout: 60000 });
  await p.getByRole('button', { name: '选择 翻盖模型', exact: true }).click();
  await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await h.expect(current).toHaveAttribute('aria-label', '取出 翻盖模型');
  await h.expect(p.locator('canvas')).toHaveCount(1);
  checks.push('画布创建后切换收藏，释放尚未显示的旧场景且新模型正常');
  await p.getByRole('button', { name: '取出 翻盖模型', exact: true }).click();
  await p.getByRole('button', { name: '放回', exact: true }).click();
  await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await h.expect(p.locator('canvas')).toHaveCount(1);
  checks.push('快速取出放回后架上模型正常，始终只保留一个画布');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await h.expect(current.locator('.model-host')).toHaveCSS('transition-duration', '0s');
  await h.expect(current.locator('.model-fallback')).toHaveCSS('transition-duration', '0s');
  checks.push('减少动态模式下无加载渐变');
  const copies = (await invoke('library_list', { query: { categoryId: 'music', status: null, query: '' } })).copies;
  const small = copies.find(copy => copy.edition.title === '翻盖模型');
  const transport = await p.evaluate(async id => {
    const base = `http://collection-model.localhost/${id}`;
    const good = await fetch(base);
    return { model: (await good.json()).title, missing: (await fetch('http://collection-model.localhost/' + '0'.repeat(64))).status,
      query: (await fetch(base + '?file=other')).status, post: (await fetch(base, { method: 'POST' })).status };
  }, small.modelAssetId);
  assert.deepEqual(transport, { model: '翻盖纪念盒', missing: 404, query: 404, post: 404 });
  checks.push('只读模型协议正确读取；未知引用、查询参数和 POST 被拒绝');
  assert.deepEqual(h.errors, []);
  await writeFile(`${h.directory}/results.json`, JSON.stringify({ checks, errors: h.errors }, null, 2));
  console.log(JSON.stringify({ directory: h.directory, checks }));
} catch (error) {
  await p?.screenshot({ path: `${h.directory}/failure.png` }).catch(() => {});
  throw error;
} finally { await h.stop(); }
