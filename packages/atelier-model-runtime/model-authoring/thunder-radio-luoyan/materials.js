import {THREE} from './surfaces.js';
export function materials(textures){
 const paper=new THREE.MeshPhysicalMaterial({color:'#e0dfd9',roughness:1,specularIntensity:.05,envMapIntensity:.05});
 const photo=id=>new THREE.MeshPhysicalMaterial({map:textures[id],color:'#ededed',roughness:.73,specularIntensity:.12,envMapIntensity:.15});
 const clear=new THREE.MeshPhysicalMaterial({color:'#ffffff',transparent:true,opacity:.19,roughness:.12,metalness:0,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:.8});
 return {paper,photo,clear};
}
