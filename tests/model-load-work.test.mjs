import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadBudget, decodeAttributeInSlices, decodeBase64InSlices } from '../packages/atelier-model-runtime/src/discs/interactive/load-work.js';
import { createGenericAsset } from '../packages/atelier-model-runtime/src/discs/interactive/generic-asset.js';

test('chunked decoding preserves binary padding, little-endian floats and unsigned indices', async () => {
 for(const size of [1,2,3,49151,49152,49153,220000]) {
  const input=Uint8Array.from({length:size},(_,i)=>i%251);
  assert.deepEqual(await decodeBase64InSlices(Buffer.from(input).toString('base64'),async()=>{}),input);
 }
 for(const [type,values] of [['Float32Array',[0,-1,1.25,0.125]],['Uint32Array',[0,65536,4294967295]]]) {
  const buffer=Buffer.alloc(values.length*4);
  values.forEach((value,i)=>type==='Uint32Array'?buffer.writeUInt32LE(value,i*4):buffer.writeFloatLE(value,i*4));
  const actual=await decodeAttributeInSlices({data:buffer.toString('base64'),count:values.length},type,async()=>{});
  assert.deepEqual([...actual],values);
 }
});
test('loading yields to navigation and stops promptly when it cancels the load', async () => {
 const controller=new AbortController(); let navigation=false;
 const work=decodeBase64InSlices(Buffer.alloc(8*1024*1024,17).toString('base64'),createLoadBudget(controller.signal,1));
 setTimeout(()=>{navigation=true;controller.abort();},0);
 await assert.rejects(work,{name:'AbortError'}); assert.equal(navigation,true);
});
test('generic asset creation remains cancellable between scene nodes', async () => {
 const controller=new AbortController();
 const definition={textures:[],materials:[],geometries:[],nodes:Array.from({length:20000},(_,i)=>({id:`node-${i}`,parent:null,position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}))};
 const work=createGenericAsset({},definition,{signal:controller.signal});
 setTimeout(()=>controller.abort(),0);
 await assert.rejects(work,{name:'AbortError'});
});
