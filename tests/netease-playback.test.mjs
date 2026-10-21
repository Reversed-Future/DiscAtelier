import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../packages/netease-sidecar/playback.cjs', import.meta.url), 'utf8');
function harness({ fail = false, cache = '{}' } = {}) {
  const events = [];
  const state = { fail, cache };
  const module = { exports: {} };
  runInNewContext(source, { module, global: { deviceId: 'test-device' }, require(name) {
    if (name === 'node:path') return { join };
    if (name === 'node:os') return { tmpdir: () => 'isolated-test-cache' };
    if (name === './auth.cjs') return {status:async (_api,cookie)=>{events.push('status');assert.equal(cookie,'MUSIC_U=test-token');return {loggedIn:!state.expired};}};
    if (name === 'node:fs') return {
      readFileSync: () => state.cache,
      writeFileSync: (path, value) => { events.push('write'); if (state.writeFailure) throw new Error('private path'); state.cache = value; },
    };
    if (name === './public-key.cjs') return async (device) => {
        events.push('initialize'); assert.equal(device, 'test-device');
        if (state.fail) throw state.fail === true ? new Error('private diagnostics') : state.fail;
        return { publicKey: 'test-key', version: '1' };
      };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const api = { song_url_v1: async args => {
    events.push('request'); assert.equal(JSON.parse(state.cache).publicKey, 'test-key');
    assert.deepEqual(JSON.parse(JSON.stringify(args)), { id: 42, level: 'standard', unblock: 'false', ...(state.cookie ? {cookie:state.cookie} : {}) });
    return { body: { code: 200, data: [{id:42,url:null}] } };
  } };
  return { play: () => module.exports(api, 42, state.cookie), events, state };
}

test('playback initializes and writes the public key before requesting audio; subsequent songs reuse it', async () => {
  const h = harness();
  assert.deepEqual(h.events, []);
  assert.equal((await h.play()).body.code, 200);
  await h.play();
  assert.deepEqual(h.events, ['initialize', 'write', 'request', 'request']);
});
test('authenticated playback carries the credential and never downgrades expired accounts to guest', async()=>{
  const h=harness();h.state.cookie='MUSIC_U=test-token';
  await h.play();assert.deepEqual(h.events,['status','initialize','write','request']);
  h.state.expired=true;
  await assert.rejects(h.play(),e=>e.code==='NETEASE_AUTH_EXPIRED');
  assert.deepEqual(h.events,['status','initialize','write','request','status']);
});

test('failed initialization never requests audio, hides private diagnostics, and can retry', async () => {
  const h = harness({ fail: true, cache: 'damaged JSON' });
  await assert.rejects(h.play(), error => error.code === 'NETEASE_PLAYBACK_INIT' && !error.message.includes('private'));
  assert.deepEqual(h.events, ['initialize']);
  h.state.fail = false;
  await h.play();
  assert.deepEqual(h.events, ['initialize', 'initialize', 'write', 'request']);
});

test('public key response and cache failures receive explicit safe reasons', async () => {
  for (const [message, reason] of [
    ['xeapi public key request failed', 'key_response'],
    ['xeapi public key response signature mismatch', 'key_signature'],
    ['xeapi public key response missing sk', 'key_missing'],
    ['xeapi public key response invalid key', 'key_missing'],
  ]) {
    await assert.rejects(harness({ fail: new Error(message) }).play(), e => e.reason === reason);
  }
  const h = harness(); h.state.writeFailure = true;
  await assert.rejects(h.play(), e => e.reason === 'cache_write' && !e.message.includes('private'));
  assert.deepEqual(h.events, ['initialize', 'write']);
});

test('installed upstream playback reproduces the missing public key failure offline', () => {
  const cache = mkdtempSync(join(tmpdir(), 'discatelier-xeapi-test-'));
  writeFileSync(join(cache, 'anonymous_token'), '');
  const modulePath = fileURLToPath(new URL('../packages/netease-sidecar/node_modules/@neteasecloudmusicapienhanced/api/module/song_url_v1.js', import.meta.url));
  const requestPath = fileURLToPath(new URL('../packages/netease-sidecar/node_modules/@neteasecloudmusicapienhanced/api/util/request.js', import.meta.url));
  const result = spawnSync(process.execPath, ['-e', `
    require('node:net').Socket.prototype.connect = () => { throw new Error('Network disabled in this test'); };
    const assert = require('node:assert/strict');
    const song = require(process.argv[1]);
    const request = require(process.argv[2]);
    assert.rejects(song({ id: 42, level: 'standard', unblock: 'false', cookie: {} }, request),
      error => error.message === 'xeapi public key is missing').then(() => process.exit(0), () => process.exit(1));
  `, modulePath, requestPath], { env: { ...process.env, TMP: cache, TEMP: cache, TMPDIR: cache }, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});
