import * as THREE from './vendor/three.module.js';
import {decodeNumbers,materialColors} from '../../../shared/model-v2.js';
import {radialDiffraction} from './material-effects.js';
import {loadTextures} from './texture-loading.js';

export async function createGenericAsset(renderer,definition,{signal}={}){
 const root=new THREE.Group(),nodes=new Map(),geometries=new Map(),materials=new Map();let textures=new Map();
 function dispose(){root.removeFromParent();for(const values of [geometries,materials,textures])for(const value of values.values())value.dispose();}
 try{
  textures=await loadTextures(renderer,definition.textures,{signal});signal?.throwIfAborted();
  for(const data of definition.materials){
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
   const geometry=new THREE.BufferGeometry();geometries.set(data.id,geometry);
   for(const [key,attribute] of Object.entries(data.attributes))geometry.setAttribute(key,new THREE.Float32BufferAttribute(decodeNumbers(attribute.array),attribute.itemSize));
   if(data.index)geometry.setIndex(new THREE.Uint32BufferAttribute(decodeNumbers(data.index,'Uint32Array'),1));
   for(const group of data.groups??[])geometry.addGroup(group.start,group.count,group.materialIndex);
   for(const [key,targets] of Object.entries(data.morphAttributes??{}))geometry.morphAttributes[key]=targets.map(target=>new THREE.Float32BufferAttribute(decodeNumbers(target),3));
   geometry.morphTargetsRelative=data.morphTargetsRelative===true;
   if(!geometry.attributes.normal)geometry.computeVertexNormals();
  }
  for(const data of definition.nodes){
   const surfaces=data.mesh?.materials.map(id=>materials.get(id));
   const node=data.mesh?new THREE.Mesh(geometries.get(data.mesh.geometry),surfaces.length===1?surfaces[0]:surfaces):new THREE.Group();nodes.set(data.id,node);
   node.name=data.id;node.position.fromArray(data.position);node.quaternion.fromArray(data.quaternion);node.scale.fromArray(data.scale);
   node.visible=data.visible!==false;node.userData.pickThrough=data.pickThrough===true;
   if(data.pickable)node.userData.item=data.id;
   if(data.weights)node.morphTargetInfluences=[...data.weights];
   node.castShadow=data.castShadow===true;node.receiveShadow=data.receiveShadow===true;
  }
  for(const data of definition.nodes)(data.parent===null?root:nodes.get(data.parent)).add(nodes.get(data.id));
  return {root,nodes,dispose};
 }catch(error){dispose();throw error;}
}
