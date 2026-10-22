import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { File } from 'node:buffer';
import { coverMime, readCover } from '../apps/desktop/src/library/artwork.ts';

const png = readFileSync(new URL('../apps/desktop/src-tauri/icons/32x32.png', import.meta.url));

test('detects the image container from bytes instead of the extension', () => {
  assert.equal(coverMime(png), 'image/png');
  assert.equal(coverMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(coverMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'image/webp');
  assert.equal(coverMime(Uint8Array.from([1, 2, 3])), null);
});

test('a PNG named .jpg is labeled with its real MIME before storage', async () => {
  const original = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        this.result = `data:${blob.type};base64,${Buffer.from(binary, 'binary').toString('base64')}`;
        this.onload?.();
      }).catch(error => { this.error = error; this.onerror?.(); });
    }
  };
  try {
    const file = new File([png], 'UPCH-29241_Add_extralarge.jpg', { type: 'image/jpeg' });
    const dataUrl = await readCover(file);
    assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  } finally {
    globalThis.FileReader = original;
  }
});
