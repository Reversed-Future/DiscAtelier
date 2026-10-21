import {THREE} from './geometry.js';
import {envelopeSize} from './envelope.js';

// The entire disc must clear the open flap before it can rotate or move sideways.
export const discExitY=envelopeSize.half+envelopeSize.fold+envelopeSize.flap+6+.3;
export function makeDiscTransfer({root,parts,motion,position}){
 const {disc,envelope}=parts;
 const exitPoint=()=>{root.updateMatrixWorld(true);return root.worldToLocal(envelope.localToWorld(new THREE.Vector3(0,discExitY,0)));};
 const clearance=()=>{root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(envelope,true);let z=-Infinity;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const w of [box.min.z,box.max.z])z=Math.max(z,root.worldToLocal(new THREE.Vector3(x,y,w)).z);return z+6.5;};
 const envelopeQuaternion=()=>root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(envelope.getWorldQuaternion(new THREE.Quaternion()));
 async function take(){
  await motion.move(disc,[0,discExitY,0]);root.updateMatrixWorld(true);root.attach(disc);
  const safe=clearance(),high=disc.position.clone();high.z=Math.max(safe,high.z);await motion.move(disc,high);
  await motion.move(disc,[position[0],position[1],high.z],new THREE.Quaternion());await motion.move(disc,position);
 }
 async function put(){
  root.updateMatrixWorld(true);root.attach(disc);const exit=exitPoint(),safe=Math.max(clearance(),disc.position.z,exit.z),high=disc.position.clone();high.z=safe;
  await motion.move(disc,high);await motion.move(disc,[exit.x,exit.y,safe],envelopeQuaternion());await motion.move(disc,exit);
  envelope.attach(disc);disc.position.set(0,discExitY,0);disc.quaternion.identity();await motion.move(disc,[0,0,0]);
 }
 return {take,put};
}
