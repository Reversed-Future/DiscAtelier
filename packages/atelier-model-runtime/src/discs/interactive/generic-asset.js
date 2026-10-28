import * as THREE from './vendor/three.module.js';
import {materialColors} from '../../../shared/model-v2.js';
import {createLoadBudget,decodeAttributeInSlices} from './load-work.js';
import {radialDiffraction} from './material-effects.js';
import {loadTextures} from './texture-loading.js';

export async function createGenericAsset(renderer,definition,{signal}={}){
 const checkpoint=createLoadBudget(signal);
 const root=new THREE.Group(),nodes=new Map(),geometries=new Map(),materials=new Map();let textures=new Map();
 function dispose(){root.removeFromParent();for(const values of [geometries,materials,textures])for(const value of values.values())value.dispose();}
 try{
  textures=await loadTextures(renderer,definition.textures,{signal});signal?.throwIfAborted();
  for(const data of definition.materials){
   await checkpoint();
   const material=new ({standard:THREE.MeshStandardMaterial,physical:THREE.MeshPhysicalMaterial,basic:THREE.MeshBasicMaterial}[data.type])();materials.set(data.id,material);
   for(const [key,value] of Object.entries(data.values??{})){
    if(materialColors.includes(key))material[key].fromArray(value);
    else if(key==='normalScale')material[key].fromArray(value);
    else material[key]=value;
   }
   for(const [key,value] of Object.entries(data.maps??{}))material[key]=textures.get(value);
   if(data.effect==='radial-diffraction')radialDiffraction(material);
  }
  for(const data of definition.geometries){
   await checkpoint();
   const geometry=new THREE.BufferGeometry();geometries.set(data.id,geometry);
   for(const [key,attribute] of Object.entries(data.attributes))geometry.setAttribute(key,new THREE.BufferAttribute(await decodeAttributeInSlices(attribute.array,'Float32Array',checkpoint),attribute.itemSize));
   if(data.index)geometry.setIndex(new THREE.BufferAttribute(await decodeAttributeInSlices(data.index,'Uint32Array',checkpoint),1));
   for(const group of data.groups??[])geometry.addGroup(group.start,group.count,group.materialIndex);
   for(const [key,targets] of Object.entries(data.morphAttributes??{})){
    geometry.morphAttributes[key]=[];
    for(const target of targets)geometry.morphAttributes[key].push(new THREE.BufferAttribute(await decodeAttributeInSlices(target,'Float32Array',checkpoint),3));
   }
   geometry.morphTargetsRelative=data.morphTargetsRelative===true;
   if(!geometry.attributes.normal)geometry.computeVertexNormals();
  }
  for(const data of definition.nodes){
   await checkpoint();
   const surfaces=data.mesh?.materials.map(id=>materials.get(id));
   const node=data.mesh?new THREE.Mesh(geometries.get(data.mesh.geometry),surfaces.length===1?surfaces[0]:surfaces):new THREE.Group();nodes.set(data.id,node);
   node.name=data.id;node.position.fromArray(data.position);node.quaternion.fromArray(data.quaternion);node.scale.fromArray(data.scale);
   node.visible=data.visible!==false;node.userData.pickThrough=data.pickThrough===true;
   if(data.pickable)node.userData.item=data.id;
   if(data.weights)node.morphTargetInfluences=[...data.weights];
   node.castShadow=data.castShadow===true;node.receiveShadow=data.receiveShadow===true;
  }
  for(const data of definition.nodes){await checkpoint();(data.parent===null?root:nodes.get(data.parent)).add(nodes.get(data.id));}
  return {root,nodes,dispose};
 }catch(error){dispose();throw error;}
}
