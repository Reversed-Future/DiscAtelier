import test from 'node:test';
import assert from 'node:assert/strict';
import { ignoredUpdate, ignoreUpdate, shouldNotifyUpdate, shareUpdateCheck, startupUpdateCheck } from '../apps/desktop/src/settings/startupUpdates.ts';
const status = version => ({ currentVersion: '0.1.27', configured: true, available: version ? { version, notes: '', ready: false } : null });

test('ignored version survives storage reads but a later version still prompts', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(shouldNotifyUpdate(status('0.1.28'), ignoredUpdate(storage)), true);
  ignoreUpdate(storage, '0.1.28');
  assert.equal(shouldNotifyUpdate(status('0.1.28'), ignoredUpdate(storage)), false);
  assert.equal(shouldNotifyUpdate(status('0.1.29'), ignoredUpdate(storage)), true);
  assert.equal(shouldNotifyUpdate(status(null), null), false);
  assert.equal(shouldNotifyUpdate(status('0.1.27'), null), false);
  assert.equal(ignoredUpdate({ getItem() { throw Error('disabled'); } }), null);
  assert.throws(() => ignoreUpdate({ setItem() { throw Error('disabled'); } }, '0.1.28'));
});

test('startup and manual checks share an active request; manual checking remains possible afterwards', async () => {
  let calls = 0, finish;
  const check = shareUpdateCheck(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const automatic = startupUpdateCheck(check);
  const first = automatic(); const manual = check();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 1); finish(status('0.1.28'));
  await Promise.all([first, manual]);
  assert.equal(await automatic(), await first); assert.equal(calls, 1);
  const again = check(); await Promise.resolve(); assert.equal(calls, 2);
  finish(status('0.1.29')); assert.equal((await again).available.version, '0.1.29');
});

test('startup errors remain quiet and do not retry until a new launch, manual retry is unaffected', async () => {
  let calls = 0;
  const check = shareUpdateCheck(async () => { calls++; if (calls === 1) throw Error('offline'); return status('0.1.28'); });
  const automatic = startupUpdateCheck(check);
  assert.equal(await automatic(), null); assert.equal(await automatic(), null); assert.equal(calls, 1);
  assert.equal((await check()).available.version, '0.1.28');
  assert.equal((await startupUpdateCheck(check)()).available.version, '0.1.28');
  assert.equal(calls, 3);
});
