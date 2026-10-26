import * as THREE from '../src/discs/interactive/vendor/three.module.js';

// Offline baker: retain each item's internal hierarchy; bake reparented item
// roots into the common model frame. Regenerated fold strips become morphs.
export function createSceneRecorder(frame,items){
 const root=new THREE.Group(),records=new Map(),parts=new Set(Object.values(items));let clips=[],frames=[],time=0;
 function visit(source,id,parent,partRoot=false){
  const copy=source.clone(false);copy.userData={...source.userData,modelId:id};copy.userData.item=partRoot?id:undefined;
  if(copy.isMesh)copy.geometry=source.geometry.clone();parent.add(copy);
  records.set(id,{copy,geometry:source.geometry,morphs:[],hashes:new Map(),partRoot});
  source.children.filter(child=>!parts.has(child)).forEach((child,i)=>visit(child,`${id}/${i}`,copy));
 }
 for(const [id,node] of Object.entries(items))visit(node,id,root,true);
 function sources(){const map=new Map();function walk(node,id){map.set(id,node);node.children.filter(child=>!parts.has(child)).forEach((child,i)=>walk(child,`${id}/${i}`));}for(const [id,node] of Object.entries(items))walk(node,id);return map;}
 function hash(array){let h=2166136261;const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);for(const byte of bytes)h=Math.imul(h^byte,16777619);return h>>>0;}
 function capture(){
  frame.updateWorldMatrix(true,true);const inverse=frame.matrixWorld.clone().invert(),poses=new Map();
  for(const [id,source] of sources()){
   const record=records.get(id);if(!record)throw Error(`录制期间出现新部件 ${id}`);
   const p=source.position.clone(),q=source.quaternion.clone(),s=source.scale.clone();
   if(record.partRoot)new THREE.Matrix4().multiplyMatrices(inverse,source.matrixWorld).decompose(p,q,s);
   const pose={position:p.toArray(),quaternion:q.toArray(),scale:s.toArray()};
   if(source.isMesh&&source.geometry!==record.geometry){
    const position=source.geometry.attributes.position,normal=source.geometry.attributes.normal;
    if(position.count!==record.copy.geometry.attributes.position.count)throw Error(`形变拓扑改变：${id}`);
    // Every regenerated strip shares a fixed topology; identical poses reuse a target.
    const key=hash(position.array);let index=record.hashes.get(key);
    if(index===undefined){index=record.morphs.length;record.hashes.set(key,index);record.morphs.push({position:position.clone(),normal:normal?.clone()});}
    pose.morph=index;
   }else if(source.morphTargetInfluences?.length)pose.weights=source.morphTargetInfluences.slice();
   poses.set(id,pose);
  }
  const snapshot={time,poses};if(frames.at(-1)?.time===time)frames[frames.length-1]=snapshot;else frames.push(snapshot);
 }
 capture();for(const [id,pose] of frames[0].poses){const node=records.get(id).copy;node.position.fromArray(pose.position);node.quaternion.fromArray(pose.quaternion);node.scale.fromArray(pose.scale);}
 async function driver(duration,apply){const start=time,count=Math.max(2,Math.ceil(duration/65));for(let i=0;i<=count;i++){const t=i/count,e=t<.5?4*t*t*t:1-(-2*t+2)**3/2;apply(e);time=start+Math.round(duration*t);capture();}}
 function begin(){time=0;frames=[];capture();}
 function end(){if(time===0){time=1;capture();}clips.push({duration:time,frames});}
 function finish(){
  for(const record of records.values())if(record.morphs.length){
   const geometry=record.copy.geometry;geometry.morphAttributes.position=record.morphs.map(p=>p.position);if(record.morphs.every(p=>p.normal))geometry.morphAttributes.normal=record.morphs.map(p=>p.normal);
   geometry.morphTargetsRelative=false;record.copy.updateMorphTargets();
  }
  return {root,clips:clips.map(clip=>{
   const tracks=[];
   for(const [id,record] of records)for(const property of ['position','quaternion','scale','weights']){
    const values=clip.frames.map(frame=>{const pose=frame.poses.get(id);if(property==='weights'&&record.morphs.length)return record.morphs.map((_,i)=>i===pose.morph?1:0);return pose[property];});
    if(!values[0]||values.every(value=>value.every((v,i)=>Math.abs(v-values[0][i])<1e-7)))continue;
    tracks.push({node:id,property,times:clip.frames.map(frame=>frame.time),values:values.flat()});
   }
   return {duration:clip.duration,tracks};
  })};
 }
 return {driver,begin,end,finish};
}
