import { join } from 'node:path';
import { desktopHarness } from './desktop-harness.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [playwright, executable, label, mode = 'before'] = process.argv.slice(2);
if (!playwright || !executable || !label) throw Error('Arguments: playwright executable label [before|after]');
const file = fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/jony-j-24.ateliermodel', import.meta.url));
const bytes = await readFile(file);
const output = process.env.DISCATELIER_ARTIFACT_ROOT
  ? join(process.env.DISCATELIER_ARTIFACT_ROOT, `performance-${label}-${Date.now()}`)
  : fileURLToPath(new URL(`../artifacts/performance-${label}-${Date.now()}/`, import.meta.url));
await mkdir(output, { recursive: true });
const runs = [];
for (let trial = 0; trial < 3; trial++) {
  const h = await desktopHarness(`perf-${label}-${trial + 1}`, playwright, {}, executable);
  try {
    const p = await h.start();
    if (mode === 'after') await writeFile(`${h.directory}/model-selection.txt`, file);
    await p.evaluate(() => window.__TAURI_INTERNALS__.invoke('library_create', { request: {
      requestId: crypto.randomUUID(), existingEditionId: null, cover: null, model: null,
      edition: { categoryId: 'music', title: 'Performance fixture', creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: 'cd', label: '' }] },
      copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
    } }));
    await p.reload();
    await p.getByRole('button', { name: '取出 Performance fixture', exact: true }).click();
    await p.getByRole('button', { name: '编辑版本', exact: true }).click();
    await p.evaluate(() => performance.clearMeasures());
    const begin = Date.now();
    if (mode === 'before') {
      const cdp = await p.context().newCDPSession(p);
      const { root } = await cdp.send('DOM.getDocument');
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[aria-label="模型文件"]' });
      await cdp.send('DOM.setFileInputFiles', { nodeId, files: [file] });
      await cdp.detach();
    } else await p.getByRole('button', { name: '上传模型', exact: true }).click();
    await h.expect(p.locator('.model-file-title')).toHaveText('24时', { timeout: 120000 });
    const ready = Date.now();
    await p.getByRole('button', { name: '保存版本', exact: true }).click();
    await h.expect(p.getByRole('dialog', { name: '编辑版本', exact: true })).not.toBeVisible({ timeout: 120000 });
    const saved = Date.now();
    await h.expect(p.locator('.record-sleeve .model-view[data-loaded="true"]')).toBeVisible({ timeout: 60000 });
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const displayed = Date.now();
    const browser = await p.evaluate(() => performance.getEntriesByType('measure').filter(e => e.name.startsWith('model.')).map(e => ({ stage: e.name, ms: e.duration })));
    const copies = await p.evaluate(() => window.__TAURI_INTERNALS__.invoke('library_list', { query: { categoryId: 'music', status: null, query: '' } }));
    assert.equal(copies.copies[0].modelAssetId, createHash('sha256').update(bytes).digest('hex'));
    await h.stop();
    const native = (await readFile(`${h.directory}/timings.ndjson`, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const run = { trial: trial + 1, directory: h.directory, prepareWallMs: ready - begin, saveWallMs: saved - ready, totalWallMs: saved - begin, displayWallMs: displayed - saved, browser, native, errors: h.errors };
    assert.deepEqual(h.errors, []);
    runs.push(run);
    console.log(JSON.stringify({ label, trial: trial + 1, prepareMs: run.prepareWallMs, saveMs: run.saveWallMs, totalMs: run.totalWallMs, displayMs: run.displayWallMs }));
  } finally { await h.stop(); }
}
const result = { label, mode, executable, modelBytes: bytes.length, modelSha256: createHash('sha256').update(bytes).digest('hex'), runs };
await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2));
console.log(`Results: ${output}/results.json`);
