import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './model-v4-fixture.mjs';
import {parseModel} from '../packages/atelier-model-runtime/index.js';
import {createIndependentControls} from '../packages/atelier-model-runtime/src/discs/interactive/model/independent-controls.js';

test('V4 represents all 1681 half-page combinations without multiplying assembly states',()=>{
 const model=parseModel(JSON.stringify(fixture(40)));
 assert.equal(model.version,4);assert.equal(model.states.length,2);assert.equal(model.controllers[0].states.length,1681);
});
test('V4 rejects foreign nodes, duplicate owners, missing activation and reset loops',()=>{
 for(const mutate of [
  m=>m.controllers[0].actions[0].tracks[0].node='other',
  m=>m.controllers.push({...m.controllers[0],id:'duplicate-owner'}),
  m=>m.controllers[0].enabledIn=['missing'],
  m=>m.controllers[0].enabledIn=['stored'],
  m=>m.controllers[0].states[1].reset={action:m.controllers[0].states[1].clicks.find(c=>c.target==='lower').action},
 ]){const m=fixture();mutate(m);assert.throws(()=>parseModel(JSON.stringify(m)));}
});
test('upper and lower positions remain independent and return before container movement',async()=>{
 const controls=createIndependentControls(parseModel(JSON.stringify(fixture()))),played=[];
 const play=async(a,reverse)=>played.push([a.id,reverse]);
 assert.equal(await controls.pick('upper','stored',play),null);
 await controls.pick('upper','out',play);await controls.pick('upper','out',play);await controls.pick('lower','out',play);
 assert.equal(controls.snapshot().reading,'page-2-1');
 await controls.beforeTransition('out','out',play);assert.equal(controls.snapshot().reading,'page-2-1');
 await controls.beforeTransition('out','stored',play);assert.equal(controls.snapshot().reading,'page-0-0');
 assert.deepEqual(played.slice(-3).map(x=>x[0]),['page-2-1-upper--1','page-1-1-upper--1','page-0-1-lower--1']);
});
test('failed page animation cannot advance local state; another part return is isolated',async()=>{
 const controls=createIndependentControls(parseModel(JSON.stringify(fixture())));
 await assert.rejects(controls.pick('upper','out',async()=>{throw Error('cancelled');}));
 assert.equal(controls.snapshot().reading,'page-0-0');
 await controls.pick('upper','out',async()=>{});await controls.returnPart('other',async()=>{});
 assert.equal(controls.snapshot().reading,'page-1-0');
 await controls.returnPart('book',async()=>{});assert.equal(controls.snapshot().reading,'page-0-0');
});
