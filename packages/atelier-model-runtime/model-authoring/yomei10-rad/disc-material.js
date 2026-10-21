import {THREE} from './surfaces.js';

// The photo defines glyph shape, while the silver itself responds to the
// studio lights and camera. Pink cherry printing keeps its diffuse material.
export function silverLetterMaterial(map,mask){
 const material=new THREE.MeshPhysicalMaterial({map,roughness:.49,metalness:0,clearcoat:.15,envMapIntensity:1.7});
 material.onBeforeCompile=shader=>{
  shader.uniforms.silverLetterMask={value:mask};
  shader.uniforms.silverInk={value:new THREE.Color('#e2e4e5')};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D silverLetterMask;\nuniform vec3 silverInk;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float silverLetters=texture2D(silverLetterMask,projectPhoto(vMapUv)).r;
   diffuseColor.rgb=mix(diffuseColor.rgb,silverInk,silverLetters);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.18,silverLetters);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,0.96,silverLetters);');
 };
 material.customProgramCacheKey=()=> 'yomei-silver-lettering-v1';
 return material;
}
