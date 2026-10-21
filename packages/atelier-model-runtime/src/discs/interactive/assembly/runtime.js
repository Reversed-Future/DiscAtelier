import * as THREE from '../vendor/three.module.js';
import {assemblyLoaders} from './registry.js';
import {loadAssemblyImages} from './images.js';

// This adapter exposes serializable controls to React; packages never supply code.
export async function createAssemblyRuntime({viewer,model,signal,onChange=()=>{},onError=()=>{}}){
 const lifetime=new AbortController(),ownedTextures=new Set();
 let built,session,latest,disposed=false;
 function dispose(){
  if(disposed)return;disposed=true;lifetime.abort();signal?.removeEventListener('abort',dispose);
  const geometries=new Set(),materials=new Set();
  built?.root.traverse(node=>{
   if(node.geometry)geometries.add(node.geometry);
   for(const material of [node.material].flat().filter(Boolean)){
    materials.add(material);for(const value of Object.values(material))if(value?.isTexture)ownedTextures.add(value);
   }
  });
  built?.root.removeFromParent();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of ownedTextures)texture.dispose();
 }
 signal?.throwIfAborted();signal?.addEventListener('abort',dispose,{once:true});
 try{
  if(!Object.hasOwn(assemblyLoaders,model.profile))throw Error('不支持的模型装配结构。');
  const profile=await assemblyLoaders[model.profile]();lifetime.signal.throwIfAborted();
  const images=await loadAssemblyImages(model.images,lifetime.signal);
  for(const texture of images.values())ownedTextures.add(texture);
  lifetime.signal.throwIfAborted();
  const textures=Object.create(null);
  for(const row of model.textures){const texture=images.get(row.image).clone();texture.needsUpdate=true;texture.colorSpace=row.id==='disc-foil-mask'?'':THREE.SRGBColorSpace;texture.anisotropy=8;textures[row.id]=texture;ownedTextures.add(texture);}
  built=profile.buildAssembly({textures,data:model.data});viewer.root.add(built.root);profile.configureViewer?.(viewer);
  const emit=state=>{
   if(disposed)return;
   let message=state.message??'';
   if(state.decoded){const decoded=model.data.decodeText?.find(row=>row.card===state.decoded);if(decoded)message+=' 孔中读到：'+decoded.words.join(' · ');}
   latest={busy:state.busy,held:state.held??null,step:0,stateId:state.selected??'assembly',returns:[],assembly:{
    message,selected:state.selected,
    actions:(state.actions??[]).map(({id,label,disabled})=>({id,label,disabled:!!disabled})),
    parts:profile.partLabels.filter(([id])=>model.profile!=='research-bai'||state.out?.has(id)).map(([id,label])=>({id,label})),
   }};onChange(latest);
  };
  session=profile.createSession({...built,viewer:{...viewer,signal:lifetime.signal},onChange:emit});
  viewer.fit([built.root],{overview:true});
  async function run(callback){
   lifetime.signal.throwIfAborted();
   try{return await callback();}catch(error){if(!disposed)onError(error);throw error;}
  }
  return {root:built.root,dispose,pick:id=>run(()=>session.pick(id)),
   act:id=>run(()=>latest.assembly.actions.some(action=>action.id===id&&!action.disabled)&&!latest.busy?session.act(id):undefined),
   select:id=>run(()=>latest.assembly.parts.some(part=>part.id===id)&&!latest.busy?(model.profile==='research-bai'?session.pick(id):session.select(id)):undefined),
   reset:()=>run(async()=>{await session.reset();lifetime.signal.throwIfAborted();viewer.fit([built.root],{overview:true});}),
   get state(){return latest;}};
 }catch(error){dispose();throw error;}
}
