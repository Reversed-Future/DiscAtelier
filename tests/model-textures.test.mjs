import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../packages/atelier-model-runtime/src/discs/interactive/vendor/three.module.js';
import { loadTextures } from '../packages/atelier-model-runtime/src/discs/interactive/texture-loading.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const renderer = { capabilities: { getMaxAnisotropy: () => 16 } };
const definitions = Array.from({ length: 7 }, (_, i) => ({
  id: `texture-${i}`, image: `image-${i}`, repeat: [2, 3], offset: [.2, .3], center: [.5, .5],
  rotation: .4, flipY: true, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, colorSpace: THREE.SRGBColorSpace,
}));
test('取消时等待正在解码的贴图清理，不创建后续任务或泄露纹理', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync, jobs = [], released = [];
  THREE.TextureLoader.prototype.loadAsync = () => new Promise(resolve => jobs.push(resolve));
  try {
    const controller = new AbortController();
    const work = loadTextures(renderer, definitions, { signal: controller.signal });
    const rejected = assert.rejects(work, { name: 'AbortError' });
    await tick(); assert.equal(jobs.length, 4); controller.abort();
    for (const [i, resolve] of jobs.entries()) {
      const texture = new THREE.Texture(); texture.addEventListener('dispose', () => released.push(i)); resolve(texture);
    }
    await rejected; assert.equal(jobs.length, 4); assert.equal(released.length, 4);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});
test('并发完成顺序不改变纹理映射及画质参数，失败释放已完成贴图', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync, released = [];
  THREE.TextureLoader.prototype.loadAsync = async url => {
    const texture = new THREE.Texture();
    texture.addEventListener('dispose', () => released.push(url));
    return texture;
  };
  try {
    const textures = await loadTextures(renderer, definitions);
    for (const data of definitions) {
      const texture = textures.get(data.id);
      assert.deepEqual(texture.repeat.toArray(), data.repeat);
      assert.deepEqual(texture.offset.toArray(), data.offset);
      for (const key of ['rotation','flipY','wrapS','wrapT','colorSpace']) assert.equal(texture[key], data[key]);
      assert.equal(texture.anisotropy, 16);
    }
    for (const texture of textures.values()) texture.dispose();
    assert.equal(released.length, 7); released.length = 0;
    THREE.TextureLoader.prototype.loadAsync = async url => {
      if (url === 'image-1') throw Error('decode failed');
      const texture = new THREE.Texture(); texture.addEventListener('dispose', () => released.push(url)); return texture;
    };
    await assert.rejects(loadTextures(renderer, definitions), /decode failed/);
    assert.equal(new Set(released).size, released.length);
    assert.ok(released.includes('image-0'));
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});
