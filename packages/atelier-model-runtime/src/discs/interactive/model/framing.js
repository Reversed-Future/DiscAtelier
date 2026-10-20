import * as THREE from '../vendor/three.module.js';
export function fitParts({scene,camera,controls,updateClipping},objects,{front=false,preserve=false,overview=false}={}){
 scene.updateMatrixWorld(true);const box=new THREE.Box3();for(const object of objects)box.expandByObject(object,true);
 // The authored front lies in world X/Z after the viewer's root rotation.
 // A straight overview aligns its edges with the flat cover; inspection keeps
 // the existing oblique framing and material/lighting configuration.
 const center=box.getCenter(new THREE.Vector3()),direction=preserve?camera.position.clone().sub(controls.target).normalize():overview?new THREE.Vector3(0,1,0):new THREE.Vector3(.12,1,front?.18:.12).normalize();
 const up=preserve?camera.up.clone():new THREE.Vector3(0,0,-1),right=new THREE.Vector3().crossVectors(up,direction).normalize(),vertical=new THREE.Vector3().crossVectors(direction,right).normalize();
 const tanY=Math.tan(camera.fov*Math.PI/360)*.8,tanX=tanY*camera.aspect;let distance=.1;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).sub(center),depth=p.dot(direction);distance=Math.max(distance,depth+Math.abs(p.dot(right))/tanX,depth+Math.abs(p.dot(vertical))/tanY);}
 controls.target.copy(center);camera.up.copy(up);camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
 controls.minDistance=Math.max(.05,box.getSize(new THREE.Vector3()).length()*.04);controls.maxDistance=Math.max(10,distance*6);controls.update();updateClipping();
}
