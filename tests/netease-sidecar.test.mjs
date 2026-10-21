import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../packages/netease-sidecar/runner.cjs', import.meta.url), 'utf8');
async function exchange(argumentsValue) {
  const input = new EventEmitter();
  const calls = [];
  let respond;
  const response = new Promise(resolve => { respond = resolve; });
  runInNewContext(source, {
    Buffer, console: {},
    process: { stdin: {}, stdout: { write: line => respond(JSON.parse(line)) }, exit: () => {} },
    require(name) {
      if (name === 'node:readline') return { createInterface: () => input };
      if (name === '@neteasecloudmusicapienhanced/api') return {
        search: async args => { calls.push(JSON.parse(JSON.stringify(args))); return { body: { code: 200, result: { albumCount: 513, albums: [] } } }; },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  input.emit('line', JSON.stringify({ id: 'page-check', operation: 'search', arguments: argumentsValue }));
  return { response: await response, calls };
}
test('bundled search forwards the requested page and preserves total count', async () => {
  const { response, calls } = await exchange({ query: 'Lemon', offset: 20 });
  assert.deepEqual(calls, [{ keywords: 'Lemon', type: 10, limit: 20, offset: 20 }]);
  assert.equal(response.body.result.albumCount, 513);
  assert.equal(response.id, 'page-check');
});
test('bundled search defaults to the first page for existing callers', async () => {
  const { calls } = await exchange({ query: 'Lemon' });
  assert.equal(calls[0].offset, 0);
});
test('bundled search refuses malformed offsets before contacting the provider', async () => {
  for (const offset of [-1, 0.5, '20', 4294967296, null]) {
    const { response, calls } = await exchange({ query: 'Lemon', offset });
    assert.equal(calls.length, 0);
    assert.equal(typeof response.error, 'string');
  }
});
