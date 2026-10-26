import {materialNumbers,materialColors,materialBooleans,materialMaps} from '../shared/model-v2.js';
import {validateModelPackage,modelFileLimit} from '../shared/interactive-model.js';

// Browser authoring helper. The website receives only the resulting JSON data.
export function packNumbers(numbers,type='Float32Array'){
 const bytes=new Uint8Array(numbers.length*4),view=new DataView(bytes.buffer);
 for(let i=0;i<numbers.length;i++)type==='Uint32Array'?view.setUint32(i*4,numbers[i],true):view.setFloat32(i*4,numbers[i],true);
 let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return {encoding:'base64',count:numbers.length,data:btoa(binary)};
}
function imageData(image){
 if(typeof image.src==='string'&&/^data:image\/(webp|png);/.test(image.src))return image.src;
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
 canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/webp',.98);
}
export function serializeScene(root){
 const nodes=[],geometries=new Map(),materials=new Map(),textures=new Map(),ids=new Map();
 root.traverse(node=>{if(node!==root)ids.set(node,node.userData.modelId||node.uuid);});
 function textureData(texture){if(!textures.has(texture.uuid))textures.set(texture.uuid,{id:texture.uuid,image:imageData(texture.image),repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),center:texture.center.toArray(),rotation:texture.rotation,flipY:texture.flipY,wrapS:texture.wrapS,wrapT:texture.wrapT,colorSpace:texture.colorSpace});return texture.uuid;}
 function materialData(material){
  if(materials.has(material.uuid))return material.uuid;
  if(!material.isMeshStandardMaterial&&!material.isMeshBasicMaterial)throw Error(`不支持的材质 ${material.type}，请先转为标准 PBR 材质。`);
  const data={id:material.uuid,type:material.isMeshPhysicalMaterial?'physical':material.isMeshStandardMaterial?'standard':'basic',values:{},maps:{}};
  if(material.customProgramCacheKey()==='disc-reading-diffraction-v1'||material.customProgramCacheKey()==='atelier-radial-diffraction-v1')data.effect='radial-diffraction';
  for(const key of [...materialNumbers,...materialColors,...materialBooleans])if(material[key]!==undefined)data.values[key]=material[key]?.toArray?material[key].toArray():material[key];
  for(const key of materialMaps)if(material[key])data.maps[key]=textureData(material[key]);
  materials.set(data.id,data);return data.id;
 }
 function attributeNumbers(attribute){const result=[];for(let i=0;i<attribute.count;i++)for(let j=0;j<attribute.itemSize;j++)result.push(attribute.getComponent(i,j));return result;}
 function geometryData(geometry){
  if(geometries.has(geometry.uuid))return geometry.uuid;
  const data={id:geometry.uuid,attributes:{},groups:geometry.groups.map(group=>({...group})),morphAttributes:{},morphTargetsRelative:geometry.morphTargetsRelative};
  for(const [key,attribute] of Object.entries(geometry.attributes)){if(!['position','normal','uv','uv1','color'].includes(key))continue;data.attributes[key]={itemSize:attribute.itemSize,array:packNumbers(attributeNumbers(attribute))};}
  if(geometry.index)data.index=packNumbers(attributeNumbers(geometry.index),'Uint32Array');
  for(const [key,targets] of Object.entries(geometry.morphAttributes))data.morphAttributes[key]=targets.map(target=>packNumbers(attributeNumbers(target)));
  geometries.set(data.id,data);return data.id;
 }
 root.traverse(node=>{if(node===root)return;
  if(!node.isMesh&&!node.isGroup&&node.type!=='Object3D')throw Error(`不支持的节点 ${node.type}；灯光和相机由网站提供。`);
  const data={id:ids.get(node),parent:node.parent===root?null:ids.get(node.parent),position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray(),visible:node.visible,pickable:!!node.userData.item,pickThrough:!!node.userData.pickThrough,castShadow:node.castShadow,receiveShadow:node.receiveShadow};
  if(node.isMesh){data.mesh={geometry:geometryData(node.geometry),materials:(Array.isArray(node.material)?node.material:[node.material]).map(materialData)};if(node.morphTargetInfluences?.length)data.weights=node.morphTargetInfluences.slice();}
  nodes.push(data);
 });
 return {up:'Z',nodes,geometries:[...geometries.values()],materials:[...materials.values()],textures:[...textures.values()]};
}
export function makeModelPackage({root,id,title,creator,cover,initialState,states,actions,navigation,shareTracks=false}){
 const model={format:'atelier-interactive-model',version:2,id,title,creator,cover,scene:serializeScene(root),initialState,states,actions:actions.map(action=>({...action,tracks:action.tracks.map(track=>({...track,values:Array.isArray(track.values)?packNumbers(track.values):track.values}))}))};
 if(navigation)model.navigation=navigation;
 if(shareTracks){const shared=new Map();for(const action of model.actions){
  if(!action.tracks.length)continue;
  const key=JSON.stringify([action.duration,action.tracks]);
  if(shared.has(key)){action.tracksFrom=shared.get(key);delete action.tracks;}else shared.set(key,action.id);
 }}
 validateModelPackage(model);if(new TextEncoder().encode(JSON.stringify(model)).length>modelFileLimit)throw Error('模型包超过 50 MiB。');return model;
}
export function downloadModel(model,filename=`${model.id}.ateliermodel`){
 validateModelPackage(model);const url=URL.createObjectURL(new Blob([JSON.stringify(model)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
