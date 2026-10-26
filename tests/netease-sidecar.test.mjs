import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../packages/netease-sidecar/runner.cjs', import.meta.url), 'utf8');
async function exchange(argumentsValue, operation = 'search', failure) {
  const input = new EventEmitter();
  const calls = [];
  let respond;
  const response = new Promise(resolve => { respond = resolve; });
  runInNewContext(source, {
    Buffer, console: {},
    process: { stdin: {}, stdout: { write: line => respond(JSON.parse(line)) }, exit: () => {} },
    require(name) {
      if (name === 'node:readline') return { createInterface: () => input };
      if (name === './playback.cjs') return async (api, id, cookie) => {
        if (failure) throw failure;
        return api.song_url_v1({ id, level: 'standard', unblock: 'false', ...(cookie ? {cookie} : {}) });
      };
      if (name === '@neteasecloudmusicapienhanced/api') return {
        search: async args => { calls.push(JSON.parse(JSON.stringify(args))); return { body: { code: 200, result: { albumCount: 513, albums: [] } } }; },
        song_url_v1: async args => { calls.push(JSON.parse(JSON.stringify(args))); return { body: { code: 200, data: [{ id: args.id, url: null, freeTrialInfo: null }] } }; },
        song_detail: async args => { calls.push(JSON.parse(JSON.stringify(args))); return { body: { code:200, songs:[{id:Number(args.ids),al:{id:42}}] } }; },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  input.emit('line', JSON.stringify({ id: 'page-check', operation, arguments: argumentsValue }));
  return { response: await response, calls };
}
test('bundled search forwards the requested page and preserves total count', async () => {
  const { response, calls } = await exchange({ query: 'Lemon', offset: 20 });
  assert.deepEqual(calls, [{ keywords: 'Lemon', type: 10, limit: 20, offset: 20 }]);
  assert.equal(response.body.result.albumCount, 513);
  assert.equal(response.id, 'page-check');
});

test('startup warmup loads the API without requesting remote data or credentials', async () => {
  const { response, calls } = await exchange({}, 'warmup');
  assert.equal(response.body.ready, true);
  assert.deepEqual(calls, []);
});
test('song URL requests use the registered API with unblocking disabled and validate the ID', async () => {
  const { response, calls } = await exchange({id:42}, 'songUrl');
  assert.deepEqual(calls,[{id:42,level:'standard',unblock:'false'}]);
  assert.equal(response.body.data[0].id,42);
  assert.equal((await exchange({id:0},'songUrl')).calls.length,0);
});
test('private playback credentials are forwarded only as arguments, never echoed in replies', async()=>{
  const {response,calls}=await exchange({id:42,cookie:'MUSIC_U=test-token'},'songUrl');
  assert.equal(calls[0].cookie,'MUSIC_U=test-token');
  assert.ok(!JSON.stringify(response).includes('test-token'));
  for(const cookie of ['MUSIC_U=bad\nvalue','MUSIC_U=token;OTHER=token','OTHER=token']) {
    assert.equal((await exchange({id:42,cookie},'songUrl')).calls.length,0);
  }
});

test('playback failures distinguish initialization and upstream failures without exposing private error text', async () => {
  for (const [failure, expected] of [
    [{ code: 'NETEASE_PLAYBACK_INIT', message: 'secret cookie' }, '网易云播放初始化失败，请检查网络后重试。'],
    [{ code: 'NETEASE_PLAYBACK_REQUEST', status: 502, message: 'secret URL' }, '网易云播放请求失败（HTTP 502），请稍后重试。'],
  ]) {
    const { response } = await exchange({id:42}, 'songUrl', failure);
    assert.equal(response.error, expected);
    assert.equal(response.errorCode, failure.code);
    assert.equal(response.errorStatus, failure.status);
  }
});

test('the pipe forwards only registered playback reasons and numeric HTTP status', async () => {
  const error = {code:'NETEASE_PLAYBACK_INIT',reason:'key_signature',status:403,message:'secret'};
  const { response } = await exchange({id:42}, 'songUrl', error);
  assert.equal(response.errorReason, 'key_signature');
  assert.equal(response.errorStatus, 403);
  const other = (await exchange({id:42}, 'songUrl', {...error,reason:'secret URL',status:'secret cookie'})).response;
  assert.equal(other.errorReason, undefined);
  assert.equal(other.errorStatus, undefined);
});
test('bundled search defaults to the first page for existing callers', async () => {
  const { calls } = await exchange({ query: 'Lemon' });
  assert.equal(calls[0].offset, 0);
});

test('song sharing uses the upstream song_detail string ids argument', async () => {
  const { response, calls } = await exchange({id:347230}, 'songDetail');
  assert.deepEqual(calls, [{ids:'347230'}]);
  assert.equal(response.body.songs[0].al.id,42);
  assert.equal((await exchange({id:0},'songDetail')).calls.length,0);
});
test('bundled search refuses malformed offsets before contacting the provider', async () => {
  for (const offset of [-1, 0.5, '20', 4294967296, null]) {
    const { response, calls } = await exchange({ query: 'Lemon', offset });
    assert.equal(calls.length, 0);
    assert.equal(typeof response.error, 'string');
  }
});
