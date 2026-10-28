import * as THREE from './vendor/three.module.js';
import {createViewer} from './model/viewer.js';
import {createGenericAsset} from './generic-asset.js';
import {createGenericSession} from './generic-session.js';
import {prepareRenderer} from './prepare-renderer.js';

export async function mountModel(host,model,{signal,onChange,onError,interactive=true}={}){
 signal?.throwIfAborted();
 let session,asset;
 const viewer=createViewer(host,(id,book)=>session?.pick(id,book).catch(()=>{}),{interactive});
 let disposed=false;
 function dispose(){if(disposed)return;disposed=true;session?.dispose();asset?.dispose();viewer.dispose();signal?.removeEventListener('abort',dispose);}
 signal?.addEventListener('abort',dispose,{once:true});
 try{
  let loaded;
  if(model.format==='discatelier-source-model'){
   const {createSourceSession}=await import('./source/session.js');
   loaded=await createSourceSession({viewer,model,signal,onChange});
  }else if(model.version===3){
   const {createAssemblyRuntime}=await import('./assembly/runtime.js');signal?.throwIfAborted();
   loaded=await createAssemblyRuntime({viewer,model,signal,onChange,onError});
  }else if(model.version===2||model.version===4)loaded=await createGenericAsset(viewer.renderer,model.scene,{signal});
  else throw Error('只支持 AtelierPublisher v2、v3 或 v4 模型。');
  if(disposed||signal?.aborted){loaded.dispose();signal?.throwIfAborted();throw Error('Model disposed');}
  asset=loaded;
  if(model.version===3||model.format==='discatelier-source-model')session=asset;
  else{viewer.root.add(asset.root);session=createGenericSession({viewer,asset,model,onChange,onError});}
  viewer.setInteractive(interactive);
  // Submit shader compilation together before the first draw; avoid serial
  // compile-status waits in render. No quality or material variants are changed.
  const compileStart=performance.now();
  await prepareRenderer(viewer.renderer,viewer.scene,viewer.camera,{signal});
  performance.measure('model.display_compile',{start:compileStart,end:performance.now()});
  signal?.throwIfAborted();
  const frameStart=performance.now();
  // Do not expose an empty canvas while waiting for the next animation frame.
  viewer.start();
  performance.measure('model.display_first_draw',{start:frameStart,end:performance.now()});
 }catch(error){dispose();throw error;}
 function screenBounds(){
  viewer.scene.updateMatrixWorld(true);viewer.camera.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(asset.items?.box??asset.root,true),points=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(viewer.camera));
  const rect=host.getBoundingClientRect(),xs=points.map(p=>(p.x+1)*rect.width/2),ys=points.map(p=>(1-p.y)*rect.height/2);
  return {left:Math.min(...xs),top:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 }
 return {reset:()=>session.reset(),activate:target=>session.pick(target),act:id=>session.act?.(id),selectPart:id=>session.select?.(id),setInteractive:value=>viewer.setInteractive(value),capturePreview:()=>viewer.capturePreview(),putBack:target=>session.putBack?.(target),exitInspection:()=>session.pick(null),dispose,screenBounds,get state(){return session.state;}};
}
