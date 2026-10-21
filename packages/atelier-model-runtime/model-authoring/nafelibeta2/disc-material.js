import {THREE} from './surfaces.js';
import {radialDiffraction} from '../../src/discs/interactive/material-effects.js';

// Figure perimeter measured on the disc photograph at 1600 × 1600.
// Keeping a contour separate from colour also includes bright specular streaks
// and excludes the dark copyright lettering below and beside the feet.
const figureOutline=[
 [730,150],[770,168],[788,210],[779,253],[750,288],[752,323],
 [822,339],[864,368],[898,433],[948,507],[1005,564],[1090,618],
 [1132,621],[1157,653],[1157,680],[1127,676],[1084,659],[998,607],
 [932,554],[871,489],[845,475],[830,541],[840,620],[938,975],
 [950,1050],[932,1150],[925,1270],[910,1298],[912,1380],[894,1416],
 [870,1410],[849,1350],[839,1280],[844,1190],[841,1077],[823,1015],
 [802,1090],[810,1195],[803,1320],[805,1430],[779,1444],[760,1425],
 [758,1340],[730,1300],[712,1210],[703,1110],[690,1000],[690,920],
 [680,640],[677,538],[656,483],[630,536],[592,595],[541,638],
 [499,685],[474,749],[445,769],[422,751],[423,713],[452,664],
 [494,617],[537,571],[568,521],[590,448],[613,393],[658,359],
 [700,334],[707,289],[686,265],[668,231],[673,192]
].map(([x,y])=>new THREE.Vector2(x/1600,1-y/1600));

// The figure is exposed disc substrate. The photograph supplies only its
// stippled boundary; photographed dark reflections and rainbow stripes are
// replaced by silver with the same lighting response as the reading face.
export function discLabelMaterial(map){
 const material=new THREE.MeshPhysicalMaterial({map,roughness:.38,metalness:0,clearcoat:.15,envMapIntensity:2});
 radialDiffraction(material);
 const diffraction=material.onBeforeCompile;
 material.onBeforeCompile=shader=>{
  diffraction(shader);
  shader.uniforms.discSubstrate={value:new THREE.Color('#e0e7e9')};
  shader.uniforms.figureOutline={value:figureOutline};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform vec3 discSubstrate;
   uniform vec2 figureOutline[${figureOutline.length}];
   float figureDistance(vec2 p){
    if(p.x<0.24||p.x>0.75||p.y<0.08||p.y>0.93)return 1.0;
    float distanceSquared=1.0; bool inside=false;
    for(int i=0;i<${figureOutline.length};i++){
     vec2 a=figureOutline[i],b=figureOutline[(i+1)%${figureOutline.length}];
     vec2 edge=b-a,delta=p-a;
     vec2 nearest=delta-edge*clamp(dot(delta,edge)/dot(edge,edge),0.0,1.0);
     distanceSquared=min(distanceSquared,dot(nearest,nearest));
     if((a.y>p.y)!=(b.y>p.y)){
      if(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
     }
    }
    return sqrt(distanceSquared)*(inside?-1.0:1.0);
   }
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   #include <map_fragment>
   float boundaryDistance=figureDistance(vMapUv);
   float figureArea=1.0-smoothstep(0.006,0.015,boundaryDistance);
   float darkestChannel = min(sampledDiffuseColor.r, min(sampledDiffuseColor.g, sampledDiffuseColor.b));
   float warmReflection=smoothstep(0.025,0.09,max(sampledDiffuseColor.r,sampledDiffuseColor.g)-sampledDiffuseColor.b);
   float photographedBoundary=max(1.0-smoothstep(0.17,0.31,darkestChannel),warmReflection);
   float core=1.0-smoothstep(-0.009,-0.003,boundaryDistance);
   float exposedSilver=figureArea*max(photographedBoundary,core);
   diffuseColor.rgb = mix(diffuseColor.rgb, discSubstrate, smoothstep(0.0, 0.02, exposedSilver));
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.14, exposedSilver);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.94, exposedSilver);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nmaterial.clearcoat = mix(material.clearcoat, 1.0, exposedSilver);');
  shader.fragmentShader=shader.fragmentShader.replace('outgoingLight += (orderOne + 0.08 * orderTwo)', 'outgoingLight += exposedSilver * (orderOne + 0.08 * orderTwo)');
 };
 material.customProgramCacheKey=()=> 'nafelibeta2-exposed-disc-silver-v1';
 return material;
}
