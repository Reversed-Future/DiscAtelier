import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseModel} from '../packages/atelier-model-runtime/index.js';
import {assemblyProfiles} from '../packages/atelier-model-runtime/shared/assembly-profiles.js';
import {assemblyLoaders} from '../packages/atelier-model-runtime/src/discs/interactive/assembly/registry.js';
import {loadAssemblyImages} from '../packages/atelier-model-runtime/src/discs/interactive/assembly/images.js';
import {makeMotion} from '../packages/atelier-model-runtime/model-authoring/research-bai/motion.js';
import {assemblyInteractionState} from '../packages/atelier-model-runtime/src/discs/interactive/assembly/interaction-state.js';
import * as THREE from '../packages/atelier-model-runtime/src/discs/interactive/vendor/three.module.js';

const cover='data:image/png;base64,'+fs.readFileSync('apps/desktop/src-tauri/icons/32x32.png').toString('base64');
test('assembly return controls respect packing constraints and only offer the selected loose part',()=>{
 const state={out:new Set(['band','folder']),open:new Set(),selected:'folder',held:'folder',actions:[{id:'put',disabled:'先展开外盒再放回'}]};
 const labels=[['folder','档案袋'],['band','橡皮带']];
 assert.deepEqual(assemblyInteractionState('research-bai',state,labels),{step:1,held:'folder',returns:[]});
 state.actions[0].disabled='';
 assert.deepEqual(assemblyInteractionState('research-bai',state,labels).returns,[{target:'folder',label:'放回档案袋',action:'put'}]);
 state.selected='case-top';assert.deepEqual(assemblyInteractionState('research-bai',state,labels).returns,[]);
});
test('jewel case controls do not expose take actions as returns or reset an untouched model',()=>{
 const state={open:false,obiOut:false,bookOut:false,discOut:false,selected:'book',held:null,actions:[{id:'book',disabled:false}]};
 assert.deepEqual(assemblyInteractionState('yomei10-rad',state,[['book','歌词本']]),{step:0,held:null,returns:[]});
 state.bookOut=true;state.held='book';
 assert.deepEqual(assemblyInteractionState('yomei10-rad',state,[['book','歌词本']]),{step:1,held:'book',returns:[{target:'book',label:'放回歌词本',action:'book'}]});
});
function fixture(profile){
 const values={boundaries:{},holePoints:[[0,0],[1,0],[0,1]],holes:Array.from({length:15},()=>({x:0,y:0,w:1,h:1})),decodeText:[],calibration:{registrations:[]}};
 return {format:'atelier-interactive-model',version:3,id:'test',title:'Fixture',creator:'Test',cover,rig:'album-assembly-v1',runtimeVersion:1,profile,
  images:[{id:'image',image:cover}],textures:assemblyProfiles[profile].textures.map(id=>({id,image:'image'})),data:Object.fromEntries(assemblyProfiles[profile].data.map(key=>[key,values[key]]))};
}
test('V3 native profile table and lazy registry match the upstream validation contract',async()=>{
 assert.deepEqual(JSON.parse(fs.readFileSync('packages/atelier-model-runtime/shared/assembly-profiles.json','utf8')),assemblyProfiles);
 assert.deepEqual(Object.keys(assemblyLoaders),Object.keys(assemblyProfiles));
 for(const id of Object.keys(assemblyProfiles)){
  const model=parseModel(JSON.stringify(fixture(id)));assert.equal(model.version,3);assert.equal(model.profile,id);
  const profile=await assemblyLoaders[id]();assert.equal(typeof profile.buildAssembly,'function');assert.equal(typeof profile.createSession,'function');assert.ok(profile.partLabels.length);
 }
});
test('V3 rejects unsupported runtimes, foreign images, corrupt references and unbounded data',()=>{
 for(const change of [m=>m.profile='constructor',m=>m.runtimeVersion=2,m=>m.rig='other',m=>m.images[0].image='https://example.com/image.png',m=>m.textures[0].image='missing',m=>m.textures.pop(),m=>m.images.push(m.images[0]),m=>m.data.holePoints=[[0,0]],m=>m.data.boundaries={bad:{}},m=>m.data.holePoints[0][0]=1e8]){
  const model=fixture('thunder-radio-luoyan');change(model);assert.throws(()=>parseModel(JSON.stringify(model)));
 }
 const model=fixture('nafelibeta2');model.script='not executable';model.module='https://example.com/code.js';
 const parsed=parseModel(JSON.stringify(model));assert.equal(parsed.script,undefined);assert.equal(parsed.module,undefined);
});
test('V3 cancellation settles four in-flight image decoders and releases every texture',async()=>{
 const original=THREE.TextureLoader.prototype.loadAsync,jobs=[],released=[];
 THREE.TextureLoader.prototype.loadAsync=()=>new Promise(resolve=>jobs.push(resolve));
 try{
  const controller=new AbortController(),work=loadAssemblyImages(Array.from({length:9},(_,i)=>({id:String(i),image:cover})),controller.signal);
  const rejected=assert.rejects(work,{name:'AbortError'});assert.equal(jobs.length,4);controller.abort();
  jobs.forEach((resolve,i)=>{const texture=new THREE.Texture();texture.addEventListener('dispose',()=>released.push(i));resolve(texture);});
  await rejected;assert.equal(jobs.length,4);assert.equal(released.length,4);
 }finally{THREE.TextureLoader.prototype.loadAsync=original;}
});
test('disposing a V3 session cancels an active animation and stops further mutations',async()=>{
 const previous={requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 let frame,cancelled=0,updates=0;
 globalThis.requestAnimationFrame=callback=>{frame=callback;return 7;};globalThis.cancelAnimationFrame=id=>{assert.equal(id,7);cancelled++;};
 try{
  const controller=new AbortController(),viewer={signal:controller.signal,controls:{update(){}}},motion=makeMotion(viewer,new THREE.Group());
  const pending=motion.tween(()=>updates++,500),rejected=assert.rejects(pending,{name:'AbortError'});assert.equal(typeof frame,'function');controller.abort();await rejected;
  assert.equal(cancelled,1);assert.equal(updates,0);await assert.rejects(motion.tween(()=>updates++,0),{name:'AbortError'});assert.equal(updates,0);
 }finally{Object.assign(globalThis,previous);}
});
