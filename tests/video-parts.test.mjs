import test from 'node:test';
import assert from 'node:assert/strict';
import {partView,partWorks,assignPart,partsError} from '../apps/desktop/src/video/parts.ts';
import {putVideoWork,removeVideoWork} from '../apps/desktop/src/video/sources.ts';
import {mergeEpisodes} from '../apps/desktop/src/video/mergedEpisodes.ts';

const work=(source,id,title)=>({source,externalId:id,title,originalTitle:title,chapters:[{id,number:'1',title,originalTitle:title,group:'本篇',episodeKind:0,airDate:'2020-01-01'}]});
const a=work('bangumi',1,'前编'),b=work('tmdbMovie',2,'前编'),c=work('bangumi',3,'后编');
const physical={volume:'上下合辑'};
const parts=[{id:'front',label:'前编',sourceKeys:['bangumi:1','tmdbMovie:2'],coverSourceKey:'tmdbMovie:2'},{id:'back',label:'后编',sourceKeys:['bangumi:3'],coverSourceKey:'bangumi:3'}];
const data=()=>({work:a,additionalWorks:[b,c],physical,parts:structuredClone(parts)});
test('legacy merged metadata stays unchanged until explicitly grouped',()=>{
 const legacy={work:a,additionalWorks:[b,c],physical};assert.equal(partView(legacy),legacy);assert.equal(partsError(legacy),'');
});
test('each card scopes all work content, preventing cross-part episode merging',()=>{
 const value=data(), front=partView(value,value.parts[0]),back=partView(value,value.parts[1]);
 assert.deepEqual(partWorks(value,value.parts[0]),[a,b]);assert.deepEqual(partWorks(value,value.parts[1]),[c]);
 assert.equal(front.physical,physical);assert.equal(back.physical,physical);
 assert.equal(front.work,a);assert.equal(back.work,c);assert.equal(mergeEpisodes([front.work])[0].rows[0].title,'前编');assert.equal(mergeEpisodes([back.work])[0].rows[0].title,'后编');
 assert.equal(partsError(value),'');
});
test('refreshing a back-part source retains front snapshots, grouping and physical data',()=>{
 const value=data(),next=putVideoWork(value,{...c,title:'后编刷新'});
 assert.equal(next.work,a);assert.equal(next.additionalWorks[0],b);assert.deepEqual(next.parts,value.parts);assert.equal(next.physical,physical);
});
test('moving sources, deleting or adding them cannot silently lose grouping',()=>{
 const value=data(),moved=assignPart(value,'tmdbMovie:2','back');
 assert.equal(moved.parts[0].coverSourceKey,'bangumi:1');assert.equal(partsError(moved),'');assert.deepEqual(value.parts,parts);
 assert.notEqual(partsError(removeVideoWork(value,'bangumi:3')),'');
 assert.notEqual(partsError(putVideoWork(value,work('bangumi',4,'新资料'))),'');
 assert.notEqual(partsError({...value,parts:[parts[0],{...parts[1],sourceKeys:['bangumi:1']}]}),'');
});
