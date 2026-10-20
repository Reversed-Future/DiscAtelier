import * as THREE from '../vendor/three.module.js';

// A disposable, unrendered proxy for framing a complete spread once.
export function readingFrame(node,bounds){
 node.updateWorldMatrix(true,false);
 const points=[];
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new THREE.Vector3(x,y,z).applyMatrix4(node.matrixWorld));
 const frame=new THREE.Object3D();frame.geometry=new THREE.BufferGeometry().setFromPoints(points);return frame;
}

// Derive resting spread bounds from authored page tracks. Work on a clone so
// neither the live leaves nor their visibility change while framing a book.
export function createReadingFrames(nodes,actions,applyTrack){
 const cache=new Map();
 return id=>{
  if(!cache.has(id)){
   const turns=[...actions.values()].filter(a=>a.keepFocus&&!a.refitFocus&&a.focus?.length===1&&a.focus[0]===id);
   if(!turns.some(a=>a.tracks.length)){cache.set(id,null);return null;}
   const node=nodes.get(id),clone=node.clone(true),originals=[],copies=[];
   node.traverse(n=>originals.push(n));clone.traverse(n=>copies.push(n));
   const byOriginal=new Map(originals.map((n,i)=>[n,copies[i]]));
   const targets=new Map([...nodes].filter(([,n])=>byOriginal.has(n)).map(([key,n])=>[key,byOriginal.get(n)]));
   clone.position.set(0,0,0);clone.quaternion.identity();clone.scale.set(1,1,1);
   const bounds=new THREE.Box3().setFromObject(clone),seen=new Set();
   for(const action of turns){
    const tracks=action.tracks.filter(t=>targets.has(t.node)&&targets.get(t.node)!==clone);
    const key=JSON.stringify(tracks);if(seen.has(key))continue;seen.add(key);
    for(const time of [0,action.duration]){
     for(const track of tracks)applyTrack(targets.get(track.node),track,time);
     clone.updateMatrixWorld(true);bounds.expandByObject(clone);
    }
   }
   cache.set(id,bounds);
  }
  const bounds=cache.get(id);return bounds?readingFrame(nodes.get(id),bounds):null;
 };
}
