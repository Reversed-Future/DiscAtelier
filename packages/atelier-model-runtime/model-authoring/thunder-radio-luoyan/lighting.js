// Local studio tuning; the shared viewer and other collections keep their lights.
export function setStudioLighting(viewer){
 viewer.scene.environmentIntensity=.7;
 viewer.scene.traverse(light=>{
  if(light.isHemisphereLight)light.intensity=.65;
  if(light.isDirectionalLight&&light.castShadow){
   light.position.set(-30,65,42);light.intensity=2.25;
   const camera=light.shadow.camera;camera.left=camera.bottom=-45;camera.right=camera.top=45;
   camera.near=1;camera.far=180;camera.updateProjectionMatrix();
   light.shadow.mapSize.set(4096,4096);light.shadow.normalBias=.015;
  }else if(light.isDirectionalLight)light.intensity=.45;
 });
}
