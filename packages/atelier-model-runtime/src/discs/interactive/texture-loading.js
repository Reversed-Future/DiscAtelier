import * as THREE from './vendor/three.module.js';

// Bound decode concurrency, retaining TextureLoader's exact image/texture path.
export async function loadTextures(renderer, definitions, {signal} = {}) {
 const textures = new Map();
 let next = 0, failure;
 async function run() {
  while (!failure && next < definitions.length) {
   signal?.throwIfAborted();
   const data = definitions[next++];
   try {
    const texture = await new THREE.TextureLoader().loadAsync(data.image);
    if (signal?.aborted || failure) {
     texture.dispose();
     signal?.throwIfAborted();
     return;
    }
    textures.set(data.id, texture);
    for (const key of ['repeat','offset','center']) texture[key].fromArray(data[key]);
    for (const key of ['rotation','flipY','wrapS','wrapT','colorSpace']) texture[key] = data[key];
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
   } catch (error) { failure = error; throw error; }
  }
 }
 // Settle all workers before releasing shared resources; no late texture leaks.
 const results = await Promise.allSettled(Array.from({length: Math.min(4, definitions.length)}, run));
 const rejected = results.find(result => result.status === 'rejected');
 if (rejected || signal?.aborted) {
  for (const texture of textures.values()) texture.dispose();
  signal?.throwIfAborted();
  throw rejected.reason;
 }
 return textures;
}
