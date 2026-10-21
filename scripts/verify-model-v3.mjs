// Explicit read-only authored-package check, without a browser or user database.
// Geometry/motion use real Three objects; image decoding is checked separately by Rust.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseModel} from '../packages/atelier-model-runtime/index.js';
import {createAssemblyRuntime} from '../packages/atelier-model-runtime/src/discs/interactive/assembly/runtime.js';
import {fitParts} from '../packages/atelier-model-runtime/src/discs/interactive/model/framing.js';
import * as THREE from '../packages/atelier-model-runtime/src/discs/interactive/vendor/three.module.js';

const directory=process.argv[2];if(!directory)throw Error('Supply the exact authored package directory');
const profiles=[
 {id:'qingluo-decoy',setup:[['act','case']],take:['pick','disc'],book:['pick','book']},
 {id:'yomei10-rad',setup:[['act','case']],take:['pick','disc'],book:['pick','book']},
 {id:'ups-and-downs-firdhaus',setup:[['act','case']],take:['pick','disc'],book:['pick','book']},
 {id:'thunder-radio-luoyan',setup:[['act','tray']],take:['act','cassette']},
 {id:'nafelibeta2',setup:[['pick','case'],['act','lid']],take:['act','take-disc'],book:['pick','book']},
 {id:'research-bai',setup:[['pick','band'],['pick','case-top'],['pick','case-bottom'],['pick','case-left'],['pick','case-right']],take:['pick','folder']},
];
globalThis.matchMedia=()=>({matches:true});
// In-memory pixels for the two procedural noise textures; no visual assertions.
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};}};}};
THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
function viewer(){
 const scene=new THREE.Scene(),root=new THREE.Group();root.rotation.x=-Math.PI/2;scene.add(root);
 const camera=new THREE.PerspectiveCamera(34,1,.1,150);camera.position.set(5,8,9);
 const controls={enabled:true,target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld();}};
 const result={scene,root,camera,controls,updateClipping(){},fit(objects,options){fitParts(result,objects,options);},
  snapshot(){return {position:camera.position.clone(),up:camera.up.clone(),target:controls.target.clone()};},
  restore(s){camera.position.copy(s.position);camera.up.copy(s.up);controls.target.copy(s.target);controls.update();}};
 return result;
}
const results=[];
for(const profile of profiles){
 const model=parseModel(fs.readFileSync(path.join(directory,profile.id+'.ateliermodel'),'utf8')),v=viewer();let state,changes=0;
 const runtime=await createAssemblyRuntime({viewer:v,model,onChange:next=>{state=next;changes++;assert.doesNotThrow(()=>JSON.stringify(next));}});
 try{
  const original=new Map();runtime.root.traverse(n=>original.set(n,{parent:n.parent,position:n.position.clone(),quaternion:n.quaternion.clone(),visible:n.visible}));
  const run=async([method,id])=>{
   if(method==='act')assert.ok(state.assembly.actions.some(action=>action.id===id&&!action.disabled),profile.id+' missing action '+id);
   await runtime[method](id);assert.equal(state.busy,false);
  };
  for(const op of profile.setup)await run(op);await run(profile.take);
  if(profile.book){
   await run(profile.book);const before=v.snapshot();const visible=new Map();runtime.root.traverse(n=>visible.set(n,n.visible));
   await run(['act','next']);await run(['act','previous']);const after=v.snapshot();
   for(const key of ['position','up','target'])assert.ok(before[key].distanceTo(after[key])<1e-7,profile.id+' reading camera '+key);
   for(const [node,value] of visible)assert.equal(node.visible,value,profile.id+' reading visibility');
  }
  await runtime.reset();assert.equal(state.busy,false);
  for(const [node,home] of original){
   assert.equal(node.parent,home.parent,profile.id+' parent '+node.name);
   assert.ok(node.position.distanceTo(home.position)<1e-6,profile.id+' position '+node.name);
   assert.ok(1-Math.abs(node.quaternion.dot(home.quaternion))<1e-6,profile.id+' rotation '+node.name);
   assert.equal(node.visible,home.visible,profile.id+' visibility '+node.name);
  }
  assert.ok(v.camera.position.clone().sub(v.controls.target).normalize().distanceTo(new THREE.Vector3(0,1,0))<1e-7);
  results.push({profile:profile.id,nodes:original.size,changes,reset:true,reading:!!profile.book});
 }finally{runtime.dispose();assert.equal(v.root.children.length,0);}
 console.log(JSON.stringify(results.at(-1)));
}
for(const file of fs.readdirSync(directory).filter(name=>name.endsWith('.ateliermodel'))){const model=parseModel(fs.readFileSync(path.join(directory,file),'utf8'));assert.ok([2,3].includes(model.version));}
console.log(JSON.stringify({assemblies:results.length,allAuthoredPackagesParsed:true,browserLaunched:false,visualsVerified:false}));
