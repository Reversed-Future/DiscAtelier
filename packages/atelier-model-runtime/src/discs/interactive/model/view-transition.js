import * as THREE from '../vendor/three.module.js';

// Orbit between views instead of cutting through the object when looking
// from opposite sides. Use the same 260 ms transition as part focusing.
export async function transitionView(viewer,to,animate){
 const from=viewer.snapshot(),rotation=view=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(view.position,view.target,view.up));
 const start=rotation(from),end=rotation(to),orientation=new THREE.Quaternion(),direction=new THREE.Vector3();
 const startDistance=from.position.distanceTo(from.target),endDistance=to.position.distanceTo(to.target);
 await animate(260,t=>{
  t=t*t*(3-2*t);
  orientation.slerpQuaternions(start,end,t);
  viewer.controls.target.lerpVectors(from.target,to.target,t);
  direction.set(0,0,1).applyQuaternion(orientation);
  viewer.camera.position.copy(viewer.controls.target).addScaledVector(direction,THREE.MathUtils.lerp(startDistance,endDistance,t));
  viewer.camera.up.set(0,1,0).applyQuaternion(orientation);
  viewer.camera.lookAt(viewer.controls.target);
 });
 viewer.restore(to);
}
