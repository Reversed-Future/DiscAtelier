import * as THREE from './vendor/three.module.js';

export async function prepareRenderer(renderer, scene, camera, {signal} = {}) {
 signal?.throwIfAborted();
 await renderer.compileAsync(scene, camera);
 signal?.throwIfAborted();
 let transmission = false;
 scene.traverseVisible(object => {
  if (!object.isMesh) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  if (materials.some(material => material.transmission > 0)) transmission = true;
 });
 if (!transmission) { await prepareBindings(renderer, signal); return; }
 // Match the pinned renderer's renderTransmissionPass shader variants. The
 // temporary target is only for compilation; no reduced-resolution image is drawn.
 const target = new THREE.WebGLRenderTarget(1, 1, {colorSpace: THREE.ColorManagement.workingColorSpace});
 const previous = renderer.getRenderTarget(), toneMapping = renderer.toneMapping;
 try {
  renderer.setRenderTarget(target); renderer.toneMapping = THREE.NoToneMapping;
  await renderer.compileAsync(scene, camera);
  signal?.throwIfAborted();
 } finally {
  if (!signal?.aborted) renderer.setRenderTarget(previous);
  renderer.toneMapping = toneMapping;
  target.dispose();
 }
 await prepareBindings(renderer, signal);
}

async function prepareBindings(renderer, signal) {
 // compileAsync waits for each material's last variant. Warm every submitted
 // program and its reflection data before draw calls start filling the GPU queue.
 const programs = [...renderer.info.programs];
 while (!programs.every(program => program.isReady())) {
  signal?.throwIfAborted();
  await new Promise(resolve => setTimeout(resolve, 10));
 }
 signal?.throwIfAborted();
 for (const program of programs) {
  program.getUniforms(); program.getAttributes();
 }
}
