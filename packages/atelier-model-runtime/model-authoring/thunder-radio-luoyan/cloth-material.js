import {THREE} from './surfaces.js';

// Only microscopic fiber relief is textured. Cloth color carries no photographed
// illumination: every broad highlight comes from geometry and scene lighting.
export function silkMaterial(){
 const size=256,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const context=canvas.getContext('2d'),pixels=context.createImageData(size,size);
 const roughCanvas=document.createElement('canvas');roughCanvas.width=roughCanvas.height=size;
 const roughContext=roughCanvas.getContext('2d'),roughPixels=roughContext.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const satin=(Math.floor(x/2)+2*Math.floor(y/2))%5;
  const grain=Math.sin(x*127.1+y*311.7)*43758.5453,random=grain-Math.floor(grain);
  const value=128+37*Math.sin((x+.18*Math.sin(y*1.3))*Math.PI/4)*(satin===0?.28:1)+10*Math.sin(y*Math.PI/4)+8*(random-.5);
  pixels.data.set([value,value,value,255],(y*size+x)*4);
  const roughness=180+36*(random-.5)+(satin===0?24:0);
  roughPixels.data.set([roughness,roughness,roughness,255],(y*size+x)*4);
 }
 context.putImageData(pixels,0,0);
 roughContext.putImageData(roughPixels,0,0);
 const weave=new THREE.CanvasTexture(canvas),roughnessMap=new THREE.CanvasTexture(roughCanvas);
 for(const texture of [weave,roughnessMap]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(9,12);texture.anisotropy=8;}
 return new THREE.MeshPhysicalMaterial({color:'#5c5666',roughness:.47,roughnessMap,metalness:0,
  ior:1.55,specularIntensity:1,envMapIntensity:2.4,anisotropy:.9,anisotropyRotation:Math.PI/2,
  sheen:.35,sheenColor:new THREE.Color('#b3abba'),sheenRoughness:.32,
  bumpMap:weave,bumpScale:.012,side:THREE.DoubleSide});
}
