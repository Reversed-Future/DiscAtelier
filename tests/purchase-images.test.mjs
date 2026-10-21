import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedRead, decodePurchaseImage } from '../apps/desktop/src/forms/purchase/image-decoder.ts';

test('stalled image reads time out, clean up and release the caller', async () => {
  let cleaned = 0;
  await assert.rejects(boundedRead(() => () => cleaned++, undefined, '读取超时', 10), /读取超时/);
  assert.equal(cleaned, 1);
});

test('cancelled reads discard late decoded images instead of retaining them', async () => {
  const controller = new AbortController();
  let resolveLate, cleaned = 0, closed = 0;
  const pending = boundedRead(resolve => { resolveLate = resolve; return () => cleaned++; }, controller.signal, '超时', 1000, image => image.close());
  controller.abort();
  await assert.rejects(pending, /已取消/);
  resolveLate({ close: () => closed++ });
  assert.equal(cleaned, 1); assert.equal(closed, 1);
});

test('synchronous browser errors and already-cancelled reads reject without leaving work pending', async () => {
  await assert.rejects(boundedRead(() => { throw Error('无法读取'); }, undefined, '超时', 10), /无法读取/);
  const controller = new AbortController(); controller.abort();
  let started = false;
  await assert.rejects(boundedRead(() => { started = true; return () => {}; }, controller.signal, '超时'), /已取消/);
  assert.equal(started, false);
});

async function browserFixture(run, failImage = false) {
  const names = ['FileReader', 'Image', 'createImageBitmap'];
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const readerInstances = [], imageInstances = [];
  let bitmapCalls = 0, bitmapClosed = 0;
  class Reader {
    static LOADING = 1;
    readyState = 0; result = null;
    constructor() { readerInstances.push(this); }
    readAsDataURL(file) { this.readyState = 1; queueMicrotask(() => { this.result = file.data; this.readyState = 2; this.onload?.(); }); }
    abort() { this.readyState = 2; this.onabort?.(); }
  }
  class Picture {
    naturalWidth = 160; naturalHeight = 240; complete = false; removed = false;
    constructor() { imageInstances.push(this); }
    set src(value) { this.url = value; queueMicrotask(() => { this.complete = true; if (failImage) this.onerror?.(); else this.onload?.(); }); }
    removeAttribute(name) { assert.equal(name, 'src'); this.removed = true; }
  }
  Object.defineProperty(globalThis, 'FileReader', { value: Reader, configurable: true });
  Object.defineProperty(globalThis, 'Image', { value: Picture, configurable: true });
  Object.defineProperty(globalThis, 'createImageBitmap', { value: async () => {
    bitmapCalls++; return { width: 80, height: 120, close: () => bitmapClosed++ };
  }, configurable: true });
  try { await run({ readerInstances, imageInstances, bitmapCalls: () => bitmapCalls, bitmapClosed: () => bitmapClosed }); }
  finally { names.forEach((name, index) => { if (descriptors[index]) Object.defineProperty(globalThis, name, descriptors[index]); else delete globalThis[name]; }); }
}

test('file reading uses the image element path first and releases decoded image resources', async () => {
  await browserFixture(async fixture => {
    const stages = [];
    const image = await decodePurchaseImage({ data: 'data:image/png;base64,fixture' }, { onProgress: value => stages.push(value) });
    assert.equal(image.width, 160); assert.equal(image.height, 240);
    assert.equal(fixture.bitmapCalls(), 0);
    assert.deepEqual(stages, ['读取图片文件…', '解码图片…']);
    assert.equal(fixture.readerInstances[0].onload, null);
    image.close(); assert.equal(fixture.imageInstances[0].removed, true);
  });
});

test('failed primary image decoding falls back and closes its bitmap', async () => {
  await browserFixture(async fixture => {
    const stages = [];
    const image = await decodePurchaseImage({ data: 'data:image/png;base64,fixture' }, { onProgress: value => stages.push(value) });
    assert.equal(image.width, 80); assert.equal(fixture.bitmapCalls(), 1);
    assert.equal(stages.at(-1), '正在尝试备用解码…');
    image.close(); assert.equal(fixture.bitmapClosed(), 1);
  }, true);
});
