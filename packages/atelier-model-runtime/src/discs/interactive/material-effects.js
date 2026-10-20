// Fixed, reviewed renderer feature. Packages select a name; they never supply GLSL.
export function radialDiffraction(material){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vDiscRadialView;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDiscRadialView = mat3(modelViewMatrix) * vec3(position.xy, 0.0);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vDiscRadialView;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   #if NUM_DIR_LIGHTS > 0
    vec3 incoming = directionalLights[0].direction;
    #if NUM_DIR_LIGHTS > 1
     if(dot(normal, directionalLights[1].direction) > dot(normal, incoming)) incoming = directionalLights[1].direction;
    #endif
    vec3 radial = normalize(vDiscRadialView);
    float trackPath = dot(radial, incoming + normalize(vViewPosition));
    float lightWindow = smoothstep(-0.1, 0.3, dot(cross(normal, radial), incoming));
    vec3 wavelengths = vec3(0.65, 0.53, 0.45) / 1.6;
    vec3 orderOne = exp(-pow((vec3(trackPath) - wavelengths) / 0.055, vec3(2.0)));
    vec3 orderTwo = exp(-pow((vec3(trackPath) - 2.0 * wavelengths) / 0.045, vec3(2.0)));
    outgoingLight += (orderOne + 0.08 * orderTwo) * lightWindow * 0.5;
   #endif
   #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey=()=> 'atelier-radial-diffraction-v1';
}
