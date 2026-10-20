import { desktopHarness } from './desktop-harness.mjs';
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const h = await desktopHarness('artwork-switch', process.argv[2]);
const checks = [], modelRequests = [];
let p;
try {
  p = await h.start();
  const invoke = (command, args) => p.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  async function create(title, modelToken = null, cover = null) {
    await invoke('library_create', { request: {
      requestId: crypto.randomUUID(), existingEditionId: null, model: null, modelToken, cover,
      edition: { categoryId: 'music', title, creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: 'cd', label: '' }] },
      copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
    } });
  }
  await create('无封面');
  for (const [file, title] of [['lemon.ateliermodel','Lemon'],['jony-j-24.ateliermodel','24时']]) {
    await writeFile(`${h.directory}/model-selection.txt`, fileURLToPath(new URL(`../../AtelierPublisher/model-authoring/packages/${file}`, import.meta.url)));
    const prepared = await invoke('model_choose');
    await create(title, prepared.token);
    await invoke('model_release', { token: prepared.token });
  }
  const coverBytes = await readFile(new URL('../apps/desktop/src-tauri/icons/icon.png', import.meta.url));
  await create('独立封面', null, `data:image/png;base64,${coverBytes.toString('base64')}`);
  p.on('request', request => { if (new URL(request.url()).hostname === 'collection-model.localhost') modelRequests.push(request.url()); });
  await p.addInitScript(() => {
    // Make the decode gap observable, independently of disk and IPC speed.
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function() {
      await new Promise(resolve => setTimeout(resolve,300));
      return decode.call(this);
    };
    window.artworkFrames = [];
    const sample = () => {
      for (const card of document.querySelectorAll('.record-sleeve')) {
        const label = card.getAttribute('aria-label');
        if (['取出 Lemon','选择 Lemon','取出 24时','选择 24时','取出 独立封面','选择 独立封面'].includes(label)) {
          const img = card.querySelector('img');
          window.artworkFrames.push({
            label, empty: !!card.querySelector('.empty-cover'), pending: !!card.querySelector('.artwork-pending'),
            ready: !!img?.complete && img.naturalWidth > 0,
          });
        }
      }
      requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  });
  await p.reload();
  await h.expect(p.locator('.record-sleeve img')).toHaveCount(3);
  await p.locator('.record-sleeve img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await h.expect(p.locator('.empty-cover')).toHaveCount(1);
  const cold = await p.evaluate(() => window.artworkFrames);
  assert.ok(cold.some(frame => frame.pending));
  assert.ok(cold.every(frame => !frame.empty));
  checks.push('人为延迟解码 300 ms：已有图片不显示默认文字封面；真正无封面仍有占位');
  await p.evaluate(() => {
    window.artworkFrames = []; window.artworkReads = 0;
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = function(command,...args) {
      if (command === 'library_model' || command === 'library_cover') window.artworkReads++;
      return invoke.call(this,command,...args);
    };
  });
  for (let i = 0; i < 8; i++) for (const title of ['Lemon','24时','独立封面']) {
    await p.getByRole('button', { name: `选择 ${title}`, exact: true }).evaluate(button => button.click());
    await p.waitForTimeout(50);
  }
  await p.waitForTimeout(350);
  const warm = await p.evaluate(() => ({ frames: window.artworkFrames, reads: window.artworkReads }));
  assert.ok(warm.frames.length > 100);
  assert.ok(warm.frames.every(frame => !frame.empty && !frame.pending && frame.ready));
  assert.equal(warm.reads,0);
  assert.equal(modelRequests.length,0);
  await h.expect(p.locator('canvas')).toHaveCount(0);
  checks.push('24 次快速切换逐帧无文字占位、无加载空帧；已解码图片不重复读取，陈列无 WebGL');
  await p.getByRole('button', { name: '选择 24时', exact: true }).click();
  await p.waitForTimeout(350);
  const hit = await p.locator('.record-sleeve[data-current="true"]').evaluate(card => {
    const rect = card.getBoundingClientRect(), x = rect.right + 8, y = rect.top + rect.height/2;
    return { x, y, label: document.elementFromPoint(x,y)?.closest('button')?.getAttribute('aria-label') };
  });
  assert.equal(hit.label,'选择 Lemon');
  await p.mouse.click(hit.x,hit.y);
  await h.expect(p.getByRole('button',{ name:'取出 Lemon',exact:true })).toBeVisible();
  await h.expect(p.getByRole('dialog',{ name:'收藏详情' })).not.toBeVisible();
  checks.push('中央封面右边缘外 8 px 命中右侧 Lemon，仅切换收藏而不打开中央项');
  await p.getByRole('button',{ name:'取出 Lemon',exact:true }).click();
  await h.expect(p.getByRole('dialog',{ name:'收藏详情' })).toBeVisible();
  await p.keyboard.press('Escape');
  await h.expect(p.getByRole('dialog',{ name:'收藏详情' })).not.toBeVisible();
  const focus = await p.locator('.record-sleeve[data-current="true"]').evaluate(card =>
    ({ focused: document.activeElement === card, outline: getComputedStyle(card).outlineStyle }));
  assert.deepEqual(focus,{focused:true,outline:'none'});
  await p.keyboard.press('ArrowLeft');
  await h.expect(p.getByRole('button',{ name:'取出 24时',exact:true })).toBeVisible();
  checks.push('Esc 返回无封面外框；焦点仍返回封面，方向键翻阅正常');
  await p.screenshot({ path: `${h.directory}/carousel.png` });
  assert.deepEqual(h.errors,[]);
  await writeFile(`${h.directory}/results.json`,JSON.stringify({checks,cold,warm,hit,focus,modelRequests,errors:h.errors},null,2));
  console.log(JSON.stringify({directory:h.directory,checks,coldFrames:cold.length,warmFrames:warm.frames.length}));
} catch(error) {
  await p?.screenshot({path:`${h.directory}/failure.png`}).catch(()=>{});
  await writeFile(`${h.directory}/failure.json`,JSON.stringify({checks,error:String(error),errors:h.errors},null,2));
  throw error;
} finally { await h.stop(); }
