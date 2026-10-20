import { desktopHarness } from './desktop-harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const [playwright, executable, label] = process.argv.slice(2);
const profile = process.argv.includes('--profile');
const trials = profile ? 1 : Number(process.argv[5] || 3);
if (!Number.isInteger(trials) || trials < 1 || trials > 5) throw Error('Trial count must be between 1 and 5.');
const source = fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/jony-j-24.ateliermodel', import.meta.url));
const output = join(process.env.DISCATELIER_ARTIFACT_ROOT, `display-${label}-${Date.now()}`);
await mkdir(output, { recursive: true });
const runs = [];
for (let trial = 1; trial <= trials; trial++) {
  const h = await desktopHarness(`display-${label}-${trial}`, playwright, {}, executable);
  try {
    const p = await h.start();
    // Timing runs have no UI actions; prevent stray input from opening inspection.
    await p.addInitScript(() => {
      for (const type of ['pointerdown', 'pointerup', 'click', 'keydown'])
        window.addEventListener(type, event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
    });
    await writeFile(`${h.directory}/model-selection.txt`, source);
    await p.evaluate(async () => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const prepared = await invoke('model_choose');
      await invoke('library_create', { request: {
        requestId: crypto.randomUUID(), existingEditionId: null, cover: null, model: null, modelToken: prepared.token,
        edition: { categoryId: 'music', title: 'Display fixture', creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: 'cd', label: '' }] },
        copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
      } });
      await invoke('model_release', { token: prepared.token });
    });
    let client;
    if (profile) {
      client = await p.context().newCDPSession(p);
      await client.send('Profiler.enable'); await client.send('Profiler.start');
      await p.addInitScript(() => {
        window.__glTimings = {};
        for (const name of ['texImage2D', 'texSubImage2D', 'generateMipmap', 'drawElements', 'linkProgram', 'getProgramParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'bufferData']) {
          const original = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function (...args) {
            const start = performance.now();
            try { return original.apply(this, args); }
            finally {
              const ms = performance.now() - start;
              const entry = window.__glTimings[name] ??= { calls: 0, totalMs: 0, maxMs: 0 };
              entry.calls++; entry.totalMs += ms; entry.maxMs = Math.max(entry.maxMs, ms);
            }
          };
        }
      });
    }
    // Fresh document, no parsed-model cache. The same frame observation is used for both builds.
    await p.reload();
    await h.expect(p.locator('.record-sleeve .model-view[data-loaded="true"]')).toBeVisible({ timeout: 90000 });
    const measured = await p.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const entries = performance.getEntriesByType('measure').filter(e => e.name.startsWith('model.display'));
      return { measures: entries.map(e => ({ stage: e.name, ms: e.duration })), observedFrameMs: performance.now() - Math.min(...entries.map(e => e.startTime)) };
    });
    if (h.errors.length) throw Error(JSON.stringify(h.errors));
    if (client) {
      await writeFile(`${output}/cpu-profile.json`, JSON.stringify(await client.send('Profiler.stop')));
      await writeFile(`${output}/gl-timings.json`, JSON.stringify(await p.evaluate(() => window.__glTimings), null, 2));
      await writeFile(`${output}/gpu.json`, JSON.stringify(await p.evaluate(() => {
        const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
      }), null, 2));
    }
    const run = { trial, ...measured };
    runs.push(run);
    console.log(JSON.stringify(run));
  } catch (error) {
    await writeFile(`${output}/failure.json`, JSON.stringify({ runs, error: String(error), errors: h.errors }, null, 2));
    throw error;
  } finally { await h.stop(); }
}
await writeFile(`${output}/results.json`, JSON.stringify({ label, executable, runs }, null, 2));
console.log(output);
