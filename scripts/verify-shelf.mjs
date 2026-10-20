import { desktopHarness } from './desktop-harness.mjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const h = await desktopHarness('shelf', process.argv[2]);
const checks = [];
let p;
try {
  p = await h.start();
  const invoke = (command, args) => p.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const path = fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/jony-j-24.ateliermodel', import.meta.url));
  await writeFile(`${h.directory}/model-selection.txt`, path);
  const prepared = await invoke('model_choose');
  for (let i = 0; i < 8; i++) await invoke('library_create', { request: {
    requestId: crypto.randomUUID(), existingEditionId: null, cover: null, model: null, modelToken: i < 7 && i % 2 ? prepared.token : null,
    edition: { categoryId: i === 7 ? 'video' : 'music', title: i === 7 ? '影像盒' : `陈列 ${i + 1}`, creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: i === 7 ? 'bd' : 'cd', label: '' }] },
    copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
  } });
  await invoke('model_release', { token: prepared.token });
  await p.reload();
  const current = p.locator('.record-sleeve[data-current="true"]');
  await current.focus();
  for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
  await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await h.expect(current.locator('.model-host')).toHaveCSS('opacity', '1');
  await p.screenshot({ path: `${h.directory}/shelf.png` });
  const shelf = await p.evaluate(() => {
    const line = getComputedStyle(document.querySelector('.record-stage'), '::before');
    const model = document.querySelector('canvas');
    window.sharedCanvas = model;
    window.mountCount = performance.getEntriesByName('model.display_mount').length;
    const selected = document.querySelector('.record-sleeve[data-current="true"]');
    const adjacent = selected.nextElementSibling;
    return { line: { content: line.content }, carousel: {
      currentWidth: selected.getBoundingClientRect().width, adjacentWidth: adjacent.getBoundingClientRect().width,
      currentOpacity: getComputedStyle(selected).opacity, adjacentOpacity: getComputedStyle(adjacent).opacity,
    }, overflow: document.documentElement.scrollWidth > innerWidth + 1,
      quality: model.getContext('webgl2').getContextAttributes(), width: model.width, cssWidth: model.clientWidth };
  });
  assert.equal(shelf.overflow, false);
  assert.equal(shelf.line.content, 'none');
  assert.ok(shelf.carousel.currentWidth > shelf.carousel.adjacentWidth);
  assert.ok(Number(shelf.carousel.currentOpacity) > Number(shelf.carousel.adjacentOpacity));
  assert.ok(shelf.quality.antialias);
  checks.push('恢复原中央放大、两侧退后变暗的陈列，无架板；保留抗锯齿且无横向溢出');
  await p.evaluate(() => {
    window.motionFrames = []; window.recordMotion = true;
    const tick = time => {
      if (!window.recordMotion) return;
      const canvas = document.querySelector('canvas'), rect = canvas?.getBoundingClientRect();
      window.motionFrames.push({ time, count: document.querySelectorAll('canvas').length, same: canvas === window.sharedCanvas, x: rect?.x, y: rect?.y, width: rect?.width });
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
  await current.click();
  await h.expect(p.locator('.interactive[data-loaded="true"]')).toBeVisible();
  await h.expect(p.locator('.shared-artwork')).toHaveCSS('transform', 'none');
  assert.equal(await p.locator('.interactive canvas').evaluate(canvas =>
    Math.abs(canvas.width - canvas.parentElement.clientWidth * Math.min(devicePixelRatio, 2)) <= 1
    && canvas.clientWidth === canvas.parentElement.clientWidth), true);
  await p.screenshot({ path: `${h.directory}/inspection.png` });
  await p.getByRole('button', { name: '放回', exact: true }).click();
  await h.expect(p.getByRole('dialog', { name: '收藏详情' })).not.toBeVisible();
  await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'true');
  assert.equal(await p.evaluate(() => document.querySelector('canvas') === window.sharedCanvas), true);
  assert.equal(await p.evaluate(() => performance.getEntriesByName('model.display_mount').length === window.mountCount), true);
  checks.push('取出和放回使用同一个 canvas／WebGL 场景，不重新读取或挂载模型');
  for (let i = 0; i < 4; i++) {
    await current.click();
    await p.waitForTimeout(60);
    await p.keyboard.press('Escape');
    await h.expect(p.getByRole('dialog', { name: '收藏详情' })).not.toBeVisible();
    await h.expect(current.locator('.model-view')).toHaveAttribute('data-loaded', 'true');
    assert.equal(await p.evaluate(() => document.querySelector('canvas') === window.sharedCanvas), true);
  }
  const frames = await p.evaluate(() => { window.recordMotion = false; return window.motionFrames; });
  await writeFile(`${h.directory}/motion-frames.json`, JSON.stringify(frames, null, 2));
  assert.ok(frames.length > 20);
  assert.ok(frames.every(frame => frame.count === 1 && frame.same && frame.width > 0));
  checks.push('开启动效中连续四次反向放回，逐帧始终只有原画布，无空白或重复模型');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await current.click(); await h.expect(p.locator('.interactive')).toBeVisible();
  assert.equal(await p.locator('.shared-artwork').evaluate(node => node.getAnimations().length), 0);
  await p.keyboard.press('Escape');
  await h.expect(p.getByRole('dialog', { name: '收藏详情' })).not.toBeVisible();
  checks.push('减少动态模式直接衔接，Escape 返回与焦点恢复正常');
  await p.getByRole('button', { name: '影像', exact: true }).click();
  await h.expect(current.locator('.physical-case')).toBeVisible();
  await p.screenshot({ path: `${h.directory}/video-cover.png` });
  await current.click();
  await p.getByRole('button', { name: '侧面', exact: true }).click();
  await h.expect(p.locator('.inspection-artwork-slot')).toHaveAttribute('data-side', 'true');
  await p.keyboard.press('Escape');
  await invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 960, height: 680 } } });
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Control+='); await p.waitForTimeout(160); }
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1), false);
  await p.screenshot({ path: `${h.directory}/shelf-200.png` });
  checks.push('影像独立分区、默认盒体侧面、最小窗口 200% 无页面滚动条');
  assert.deepEqual(h.errors, []);
  await writeFile(`${h.directory}/results.json`, JSON.stringify({ checks, shelf, frames, errors: h.errors }, null, 2));
  console.log(JSON.stringify({ directory: h.directory, checks, shelf }));
} catch (error) {
  await p?.screenshot({ path: `${h.directory}/failure.png` }).catch(() => {});
  await writeFile(`${h.directory}/failure.json`, JSON.stringify({ checks, errors: h.errors, error: String(error) }, null, 2));
  throw error;
} finally { await h.stop(); }
