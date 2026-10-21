import * as THREE from '../../src/discs/interactive/vendor/three.module.js';
export {THREE};

// Project each photograph by its complete paper boundary. The shader keeps
// the original pixels and also follows the measured bowed top/bottom edges.
export function applyPhotoMapping(root,textures,boundaries){
 const byTexture=new Map(Object.entries(textures).map(([id,t])=>[t,id]));
 const done=new Set();
 root.traverse(node=>{
  const materials=Array.isArray(node.material)?node.material:[node.material];
  for(const material of materials){
   if(!material||done.has(material))continue;
   const id=byTexture.get(material.map),data=boundaries[id];
   if(!data)continue;done.add(material);
   const previous=material.onBeforeCompile;
   material.onBeforeCompile=shader=>{
    previous.call(material,shader);
    shader.uniforms.photoProjection={value:new THREE.Matrix3().set(...data.homography)};
    shader.uniforms.photoEdges={value:new THREE.Vector2(...data.edgeOffsets)};
    shader.uniforms.photoCenterOffset={value:new THREE.Vector2(...(data.centerOffset??[0,0]))};
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
     uniform mat3 photoProjection;
     uniform vec2 photoEdges;
     uniform vec2 photoCenterOffset;
     vec2 projectPhoto(vec2 uv){
      vec2 paper=vec2(uv.x,1.0-uv.y);
      vec3 source=photoProjection*vec3(paper,1.0);
      vec2 p=source.xy/source.z;
      p.y+=4.0*paper.x*(1.0-paper.x)*mix(photoEdges.x,photoEdges.y,paper.y);
      vec2 radial=2.0*(paper-0.5);
      p+=photoCenterOffset*max(0.0,1.0-dot(radial,radial));
      return vec2(p.x,1.0-p.y);
     }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, projectPhoto(vMapUv) )'));
   };
   material.customProgramCacheKey=()=> 'firdhaus-photo-boundary-v1-'+id;
   material.needsUpdate=true;
  }
 });
}

export async function loadSurfaces(){
 const inventory=await(await fetch('./texture-inventory.json',{cache:'no-store'})).json();
 const boundaries=await(await fetch('./photo-boundaries.json',{cache:'no-store'})).json();
 const loader=new THREE.TextureLoader(),textures={},files=new Map();
 await Promise.all(inventory.map(async row=>{
  if(!files.has(row.file))files.set(row.file,loader.loadAsync('./textures/'+row.file+'?v='+row.revision));
  // Each surface gets its own texture identity even when the source is shared.
  const original=await files.get(row.file),t=original.clone();t.needsUpdate=true;
  t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;textures[row.id]=t;
 }));
 return {textures,boundaries};
}
