import * as THREE from '../vendor/three.module.js';

// Decode unique embedded images once, with the same four-task limit as V2.
export async function loadAssemblyImages(definitions, signal) {
 const images=new Map();let next=0,failure;
 async function worker(){
  while(!failure&&next<definitions.length){
   signal?.throwIfAborted();const row=definitions[next++];
   try{
    const texture=await new THREE.TextureLoader().loadAsync(row.image);
    if(signal?.aborted||failure){texture.dispose();signal?.throwIfAborted();return;}
    images.set(row.id,texture);
   }catch(error){failure=error;throw error;}
  }
 }
 const results=await Promise.allSettled(Array.from({length:Math.min(4,definitions.length)},worker));
 const rejected=results.find(result=>result.status==='rejected');
 if(rejected||signal?.aborted){for(const texture of images.values())texture.dispose();signal?.throwIfAborted();throw rejected.reason;}
 return images;
}
