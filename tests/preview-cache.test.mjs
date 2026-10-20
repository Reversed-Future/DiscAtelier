import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewCache } from '../apps/desktop/src/models/preview-cache.ts';
const frame = (width = 512, size = 4) => ({ width, height: width, blob: new Blob(['x'.repeat(size)], { type: 'image/png' }) });
test('并发预览读取共享任务；缓存按数量和字节上限淘汰', async () => {
  let reads = 0;
  const cache = createPreviewCache({ read: async () => { reads++; return frame(); }, write: async () => {} }, 2, 8);
  const [a, b] = await Promise.all([cache.get('a'), cache.get('a')]);
  assert.equal(a, b); assert.equal(reads, 1);
  await cache.get('b'); await cache.get('a'); await cache.get('c');
  assert.equal(cache.peek('b'), null);
  assert.ok(cache.peek('a')); assert.ok(cache.peek('c'));
  await cache.put('d', frame(1024, 8));
  assert.equal(cache.peek('a'), null); assert.equal(cache.peek('c'), null);
  assert.equal(cache.peek('d').width, 1024);
});
test('新首帧覆盖在途旧读取，低分辨率不会替换已缓存的高分辨率预览', async () => {
  let resolveRead, writes = 0, notified = 0;
  const cache = createPreviewCache({ read: () => new Promise(resolve => { resolveRead = resolve; }), write: async () => { writes++; } });
  const cancel = cache.subscribe('album', () => notified++);
  const pending = cache.get('album');
  await cache.put('album', frame(1024)); resolveRead(frame(256));
  assert.equal((await pending).width, 1024);
  await cache.put('album', frame(512));
  assert.equal(writes, 1); assert.equal(notified, 1);
  cancel(); await cache.put('album', frame(2048)); assert.equal(notified, 1);
});
test('缓存拒绝读写不影响展示，不把超限图留在内存缓存', async () => {
  const cache = createPreviewCache({ read: async () => { throw Error('unavailable'); }, write: async () => { throw Error('quota'); } }, 2, 8);
  assert.equal(await cache.get('album'), null);
  await cache.put('album', frame(1024, 16));
  assert.equal(cache.peek('album'), null);
});
