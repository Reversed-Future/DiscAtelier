import * as THREE from '../vendor/three.module.js';

// Location's action tracking: translate the camera and its target together.
// Rotation, viewing distance and user-selected zoom stay unchanged in transit.
export function followPartView(viewer,root,objects){
 const center=()=>{root.updateWorldMatrix(true,true);return objects.reduce((sum,n)=>sum.add(n.getWorldPosition(new THREE.Vector3())),new THREE.Vector3()).multiplyScalar(1/objects.length);};
 const start=center(),view=viewer.snapshot();
 return ()=>{const offset=center().sub(start);viewer.camera.position.copy(view.position).add(offset);viewer.controls.target.copy(view.target).add(offset);viewer.camera.lookAt(viewer.controls.target);};
}
