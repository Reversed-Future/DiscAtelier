import * as THREE from '../vendor/three.module.js';

// Tighten the depth range around the visible model, including moving parts.
// A fixed million-to-one range cannot reliably separate paper-thin layers.
export function createModelClipping(root,camera) {
  const bounds=new THREE.Box3(),partBounds=new THREE.Box3(),toCamera=new THREE.Matrix4(),size=new THREE.Vector3();
  return function updateClipping() {
    root.updateWorldMatrix(true,true);camera.updateMatrixWorld();bounds.makeEmpty();
    root.traverseVisible(node=>{
      if(!node.isMesh)return;
      if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
      toCamera.multiplyMatrices(camera.matrixWorldInverse,node.matrixWorld);
      partBounds.copy(node.geometry.boundingBox).applyMatrix4(toCamera);bounds.union(partBounds);
    });
    if(bounds.isEmpty()||bounds.min.z>=0)return;
    bounds.getSize(size);
    const extent=Math.max(size.x,size.y,size.z,.0001),padding=extent*.05;
    const near=Math.max(extent/10000,-bounds.max.z-padding);
    const far=Math.max(near+extent*.1,-bounds.min.z+padding);
    if(camera.near===near&&camera.far===far)return;
    camera.near=near;camera.far=far;camera.updateProjectionMatrix();
  };
}
