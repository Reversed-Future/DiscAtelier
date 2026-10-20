import { desktopHarness } from './desktop-harness.mjs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { parseModel } from '../packages/atelier-model-runtime/index.js';

const h = await desktopHarness('model-matrix', process.argv[2]);
const moduleUrl = process.argv[3];
if (!moduleUrl) throw Error('Pass the exact built mount-model module URL.');
const source = fileURLToPath(new URL('../../AtelierPublisher/model-authoring/packages/', import.meta.url));
const results = [];
function pathsFor(model) {
  const actions = new Map(model.actions.map(action => [action.id, action]));
  const edges = state => [
    ...state.clicks.map(click => ({ method: 'activate', target: click.target, to: actions.get(click.action).to })),
    ...(state.returns || []).map(option => {
      const last = option.steps.at(-1), action = actions.get(last.action);
      return { method: 'putBack', target: option.target, to: last.reverse ? action.from : action.to };
    }),
  ];
  const states = new Map(model.states.map(state => [state.id, state]));
  const paths = new Map([[model.initialState, []]]), queue = [model.initialState];
  for (let i = 0; i < queue.length; i++) for (const edge of edges(states.get(queue[i])))
    if (!paths.has(edge.to)) { paths.set(edge.to, [...paths.get(queue[i]), edge]); queue.push(edge.to); }
  return { paths, edges };
}
let p;
try {
  p = await h.start();
  const invoke = (command, args) => p.evaluate(async ({ command, args }) => {
    try { return await window.__TAURI_INTERNALS__.invoke(command, args); }
    catch (error) { throw Error(JSON.stringify(error)); }
  }, { command, args });
  const files = (await readdir(source)).filter(file => file.endsWith('.ateliermodel')).sort();
  const requested = process.argv[4];
  if (requested && !files.includes(requested)) throw Error('The requested model is not an exported package.');
  for (const file of requested ? [requested] : files) {
    const model = parseModel(await readFile(`${source}/${file}`, 'utf8'));
    const { paths, edges } = pathsFor(model);
    assert.equal(paths.size, model.states.length, `${file}: unreachable authored states`);
    await writeFile(`${h.directory}/model-selection.txt`, `${source}/${file}`);
    const prepared = await invoke('model_choose');
    const id = await invoke('library_create', { request: {
      requestId: crypto.randomUUID(), existingEditionId: null, cover: null, model: null, modelToken: prepared.token,
      edition: { categoryId: 'music', title: model.title, creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: 'cd', label: '' }] },
      copy: { status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY', seller: '', purchaseUrl: '', storageLocation: '', notes: '' },
    } });
    await invoke('model_release', { token: prepared.token });
    const copies = (await invoke('library_list', { query: { categoryId: 'music', status: null, query: '' } })).copies;
    const assetId = copies.find(copy => copy.id === id).modelAssetId;
    await p.evaluate(async ({ assetId, moduleUrl }) => {
      const model = await (await fetch(`http://collection-model.localhost/${assetId}`)).json();
      const host = document.createElement('div');
      host.id = 'matrix-model'; host.style.cssText = 'position:fixed;inset:100px auto auto 80px;width:600px;height:600px;background:#121212;z-index:100';
      document.body.append(host);
      const { mountModel } = await import(moduleUrl);
      window.matrixHandle = await mountModel(host, model, { interactive: true });
      window.matrixInitialBounds = window.matrixHandle.screenBounds();
    }, { assetId, moduleUrl });
    await p.screenshot({ path: `${h.directory}/${file}.png` });
    // Real-time first action and continuous page turns; no shortened durations.
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    const pageAction = model.actions.find(action => action.keepFocus && !action.refitFocus);
    const normalPath = pageAction ? paths.get(pageAction.from) : [];
    const normal = [...normalPath];
    let state = model.states.find(state => state.id === (pageAction?.from || model.initialState));
    for (let i = 0; i < (pageAction ? 4 : 1); i++) {
      const click = state.clicks.find(click => {
        const action = model.actions.find(action => action.id === click.action);
        return pageAction ? action.keepFocus && !action.refitFocus : true;
      });
      if (!click) break;
      const action = model.actions.find(action => action.id === click.action);
      normal.push({ method: 'activate', target: click.target, to: action.to });
      state = model.states.find(state => state.id === action.to);
    }
    const frames = await p.evaluate(async steps => {
      let frames = 0, running = true;
      const count = () => { if (running) { frames++; requestAnimationFrame(count); } }; requestAnimationFrame(count);
      try {
        for (const step of steps) {
          await window.matrixHandle[step.method](step.target);
          if (window.matrixHandle.state.stateId !== step.to) throw Error(`normal motion: ${step.to}`);
        }
      } finally { running = false; }
      return frames;
    }, normal);
    assert.ok(frames > 1, `${file}: real-time animation missing`);
    await p.screenshot({ path: `${h.directory}/${file}-opened.png` });
    await p.evaluate(() => window.matrixHandle.reset());
    await p.emulateMedia({ reducedMotion: 'reduce' });
    let checked = 0, inspected = 0;
    for (const state of model.states) {
      const result = await p.evaluate(async ({ initial, state, path, edges }) => {
        const handle = window.matrixHandle;
        const check = expected => {
          if (handle.state.stateId !== expected || handle.state.busy) throw Error(`Expected ${expected}, got ${JSON.stringify(handle.state)}`);
          if (!Object.values(handle.screenBounds()).every(Number.isFinite)) throw Error('Nonfinite model bounds');
        };
        async function reset() {
          await handle.reset(); check(initial);
          const bounds = handle.screenBounds(), home = window.matrixInitialBounds;
          if (Object.keys(home).some(key => Math.abs(bounds[key] - home[key]) > .1)) throw Error(`Reset did not restore the original pose and view: ${JSON.stringify({ testedState: state.id, bounds, home })}`);
        }
        async function reach() { await reset(); for (const step of path) await handle[step.method](step.target); check(state.id); }
        for (const edge of edges) { await reach(); await handle[edge.method](edge.target); check(edge.to); }
        let inspected = 0;
        for (const target of state.inspect || []) {
          if (state.clicks.some(click => click.target === target)) continue;
          await reach(); await handle.exitInspection(); await handle.activate(target);
          if (handle.state.held !== target) throw Error(`Inspect failed: ${target}`);
          await handle.exitInspection(); check(state.id); inspected++;
        }
        await reset();
        await new Promise(resolve => requestAnimationFrame(resolve));
        return inspected;
      }, { initial: model.initialState, state, path: paths.get(state.id), edges: edges(state) });
      checked += edges(state).length; inspected += result;
    }
    await p.evaluate(() => { window.matrixHandle.dispose(); document.getElementById('matrix-model').remove(); });
    results.push({ file, title: model.title, states: paths.size, edges: checked, inspections: inspected, normalMotionSteps: normal.length, normalMotionFrames: frames });
    console.log(JSON.stringify(results.at(-1)));
    await writeFile(`${h.directory}/results.json`, JSON.stringify({ results, errors: h.errors }, null, 2));
  }
  assert.deepEqual(h.errors, []);
  console.log(h.directory);
} catch (error) {
  await p?.screenshot({ path: `${h.directory}/failure.png` }).catch(() => {});
  await writeFile(`${h.directory}/failure.json`, JSON.stringify({ results, errors: h.errors, error: String(error) }, null, 2));
  throw error;
} finally { await h.stop(); }
