import {THREE} from './geometry.js';
import {followPartView} from '../../src/discs/interactive/model/action-view.js';
import {transitionView} from '../../src/discs/interactive/model/view-transition.js';
const v=()=>new THREE.Vector3();
function ease(t){
 const a=.77,b=.175;let u=t;
 for(let i=0;i<6;i++){const x=3*a*u*(1-u)**2+3*b*u*u*(1-u)+u**3;const d=3*a*(1-u)*(1-3*u)+3*b*u*(2-3*u)+3*u*u;if(Math.abs(d)>.0001)u=THREE.MathUtils.clamp(u-(x-t)/d,0,1);}
 return u*u*(3-2*u);
}
export function makeMotion(viewer,root){
 let followed=[];
 const follow=objects=>{followed=objects;};
 const home=new Map();root.traverse(n=>{if(n.userData.item)home.set(n,{parent:n.parent,position:n.position.clone(),quaternion:n.quaternion.clone()});});
 const duration=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:500;
 async function tween(update,ms=duration(),track=true,eased=true){
  viewer.signal?.throwIfAborted();
  const updateView=track&&followed.length?followPartView(viewer,root,followed):null;
  const apply=t=>{update(t);root.updateMatrixWorld(true);updateView?.();};
  if(!ms){apply(1);viewer.controls.update();return;}
  const start=performance.now();await new Promise((resolve,reject)=>{
   let raf=0;const clean=()=>viewer.signal?.removeEventListener('abort',abort);
   function abort(){cancelAnimationFrame(raf);clean();reject(viewer.signal.reason);}
   function frame(now){try{viewer.signal?.throwIfAborted();const t=Math.min(1,(now-start)/ms);apply(eased?ease(t):t);if(t<1)raf=requestAnimationFrame(frame);else{clean();resolve();}}catch(error){clean();reject(error);}}
   viewer.signal?.addEventListener('abort',abort,{once:true});raf=requestAnimationFrame(frame);
  });viewer.controls.update();
 }
 const pose=n=>({position:n.position.clone(),quaternion:n.quaternion.clone()});
 async function move(n,position,quaternion=n.quaternion.clone()){
  const from=pose(n),to=position instanceof THREE.Vector3?position:new THREE.Vector3(...position);await tween(t=>{n.position.lerpVectors(from.position,to,t);n.quaternion.slerpQuaternions(from.quaternion,quaternion,t);});
 }
 async function angles(entries){const from=entries.map(([n,axis])=>n.rotation[axis]);await tween(t=>entries.forEach(([n,axis,target],i)=>{n.rotation[axis]=THREE.MathUtils.lerp(from[i],target,t);if(n.userData.foldHeight!==undefined)n.position.z=n.userData.foldHeight*Math.abs(n.rotation[axis])/Math.PI;}));}
 async function out(n,position){
  root.updateMatrixWorld(true);root.attach(n);const lift=n.position.clone();lift.z+=3;await move(n,lift);await move(n,position,new THREE.Quaternion());
 }
 async function put(n,{approach=null}={}){
  const h=home.get(n);root.updateMatrixWorld(true);
  const world=h.parent.localToWorld(h.position.clone()),target=root.worldToLocal(world);
  const q=h.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(h.quaternion);q.premultiply(root.getWorldQuaternion(new THREE.Quaternion()).invert());
  root.attach(n);const high=approach?root.worldToLocal(h.parent.localToWorld(h.position.clone().add(new THREE.Vector3(...approach)))):target.clone();if(!approach)high.z=Math.max(n.position.z,target.z)+3;await move(n,high,q);await move(n,target,q);
  h.parent.attach(n);n.position.copy(h.position);n.quaternion.copy(h.quaternion);
 }
 async function cameraTo(to){const enabled=viewer.controls.enabled;viewer.controls.enabled=false;try{await transitionView(viewer,to,(ms,update)=>tween(update,duration()?ms:0,false,false));}finally{viewer.controls.enabled=enabled;viewer.controls.update();}}
 async function focus(objects,{front=false,preserve=true,zoom=1}={}){const before=viewer.snapshot();viewer.fit(objects,{front,preserve});const after=viewer.snapshot();after.position.sub(after.target).multiplyScalar(zoom).add(after.target);viewer.restore(before);await cameraTo(after);}
 return {home,tween,move,angles,out,put,focus,cameraTo,follow};
}
