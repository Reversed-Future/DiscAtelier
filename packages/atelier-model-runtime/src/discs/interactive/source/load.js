import * as THREE from '../vendor/three.module.js';
import {sourceResources} from './resources.js';

export function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse(object => {if(object.geometry)geometries.add(object.geometry);for(const material of [object.material].flat().filter(Boolean))materials.add(material);});
  for(const material of materials) {for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
  for(const texture of textures){texture.source?.data?.close?.();texture.dispose();}
  for(const geometry of geometries)geometry.dispose();
}
function checkGLB(bytes) {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length||view.getUint32(16,true)!==0x4e4f534a)throw Error('GLB 文件头无效。');
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+view.getUint32(12,true))));
  const unsupported=['KHR_draco_mesh_compression','KHR_texture_basisu','EXT_meshopt_compression','KHR_meshopt_compression'];
  for(const extension of json.extensionsRequired||[])if(unsupported.includes(extension))throw Error(`此 GLB 使用 ${extension} 压缩，当前版本暂不支持该扩展。`);
  for(const item of [...(json.buffers||[]),...(json.images||[])]) {
    if(item.uri && /^(blob:|https?:|file:|\/\/)/.test(item.uri))throw Error('GLB 只能使用内置资源或目录内相对路径。');
    if(item.byteLength>128*1024*1024)throw Error('GLB 缓冲区过大。');
  }
}
export async function loadSource(model,{signal}={}) {
  signal?.throwIfAborted();const resources=sourceResources(model,signal);let root,animations=[],disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;disposeObject(root);resources.dispose();};
  try {
    await resources.prepare();
    if(model.sourceFormat==='glb'||model.sourceFormat==='skp') {
      const {GLTFLoader}=await import('../vendor/source/loaders/GLTFLoader.js');signal?.throwIfAborted();
      const data=resources.bytes(model.sourceFormat==='skp'?'__discatelier/sketchup.glb':model.main);checkGLB(data);
      const gltf=await new GLTFLoader(resources.manager).parseAsync(data.buffer,'');root=gltf.scene;animations=gltf.animations;

    } else if(model.sourceFormat==='obj') {
      const [{OBJLoader},{MTLLoader}]=await Promise.all([import('../vendor/source/loaders/OBJLoader.js'),import('../vendor/source/loaders/MTLLoader.js')]);signal?.throwIfAborted();
      const source=resources.text(model.main),loader=new OBJLoader(resources.manager),creators=[];
      for(const line of source.split(/\r?\n/)) {
        const name=line.trim().match(/^mtllib (.+)$/)?.[1]?.trim();if(!name)continue;
        const at=name.replaceAll('\\','/').lastIndexOf('/'),base=at<0?'':name.replaceAll('\\','/').slice(0,at+1);
        creators.push(new MTLLoader(resources.manager).parse(resources.text(name),base));
      }
      if(creators.length)loader.setMaterials({create(name){const found=creators.findLast(c=>Object.hasOwn(c.materialsInfo,name));if(!found)throw Error(`MTL 未定义材质：${name}`);return found.create(name);}});
      root=loader.parse(source);
    } else {
      const {FBXLoader}=await import('../vendor/source/loaders/FBXLoader.js');signal?.throwIfAborted();
      root=new FBXLoader(resources.manager).parse(resources.bytes(model.main).buffer,'');animations=root.animations||[];
    }
    await resources.finish();signal?.throwIfAborted();
    let vertices=0,meshes=0,pixels=0;const textures=new Set();
    root.traverse(object=>{
      if(object.geometry){vertices+=object.geometry.attributes.position?.count||0;meshes++;}
      for(const material of [object.material].flat().filter(Boolean))for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    });
    for(const texture of textures){const image=texture.image;if(image?.width>8192||image?.height>8192)throw Error('贴图单边不能超过 8192 像素。');pixels+=(image?.width||0)*(image?.height||0);}
    if(!meshes||!vertices)throw Error('模型没有可显示的几何体。');
    if(vertices>5_000_000||meshes>10000||pixels>128*1024*1024)throw Error('模型几何体或贴图总量过大，请先简化。');
    const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
    if(![...bounds.min,...bounds.max].every(Number.isFinite)||size.length()===0)throw Error('模型尺寸或顶点数据无效。');
    return {root,animations,dispose};
  } catch(error){dispose();throw error;}
}
