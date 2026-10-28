import {createLoadBudget} from './load-work.js';

// Upload each texture before first draw, allowing input and cancellation between uploads.
export async function prepareTextures(renderer, scene, {signal} = {}) {
 const checkpoint=createLoadBudget(signal), textures=new Set();
 scene.traverse(object=>{
  for(const material of [object.material].flat().filter(Boolean)){
   for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  }
 });
 const start=performance.now();
 for(const texture of textures){
  await checkpoint(true);
  renderer.initTexture(texture);
 }
 await checkpoint(true);
 performance.measure('model.display_texture_upload',{start,end:performance.now()});
}
