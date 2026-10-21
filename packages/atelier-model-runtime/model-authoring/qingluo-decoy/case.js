import * as THREE from '../../src/discs/interactive/vendor/three.module.js';
import {dimensions as d,bookDepth} from './dimensions.js';

export const hingeX=-d.caseWidth/2+d.hingeWidth;
export const hingeZ=d.caseDepth/2;
export const bookStored=[d.hingeWidth/2,0,d.caseDepth-d.plastic-.025-bookDepth];
export const bookTaken=[hingeX-(d.caseWidth-d.hingeWidth)/2-d.bookWidth-1,0,1.2];

export function addCase(parent,p){
 const shell=p.group('case',parent),rear=p.group('rear-shell',shell),lid=p.group('lid',shell);
 lid.position.set(hingeX,0,hingeZ);
 // Transmission keeps the artwork visible; alpha must not wash out the
 // specular lobe along with it. The shared studio supplies moving reflections.
 const glass=new THREE.MeshPhysicalMaterial({color:'#f5fafb',roughness:.055,metalness:0,transmission:.94,thickness:.15,ior:1.49,transparent:true,opacity:.88,depthWrite:false,envMapIntensity:1.65,clearcoat:1,clearcoatRoughness:.045});
 const rim=glass.clone();rim.opacity=.96;rim.transmission=.86;rim.roughness=.075;rim.envMapIntensity=1.9;
 function box(group,id,size,pos,material=glass){const m=p.box(group,id,size,pos,material);m.castShadow=false;return m;}
 box(rear,'rear-clear-panel',[d.caseWidth,d.caseHeight,d.plastic],[0,0,d.plastic/2]);
 for(const side of [-1,1]){
  box(rear,`rear-side-${side}`,[d.plastic,d.caseHeight,.55],[side*(d.caseWidth-d.plastic)/2,0,.425],rim);
  box(rear,`rear-rail-${side}`,[d.caseWidth-2*d.plastic,d.plastic,.55],[0,side*(d.caseHeight-d.plastic)/2,.425],rim);
  for(const [i,x]of [-3.9,3.9].entries())box(rear,`paper-retainer-${side}-${i}`,[.8,.2,.08],[x,side*6.02,.64],rim);
 }
 const w=d.caseWidth-d.hingeWidth;
 box(lid,'lid-clear-panel',[w,d.caseHeight,d.plastic],[w/2,0,.425]);
 for(const side of [-1,1]){
  box(lid,`lid-rail-${side}`,[w,.07,.36],[w/2,side*6.045,.17],rim);
  box(lid,`hinge-arm-${side}`,[d.hingeWidth,.17,.3],[-d.hingeWidth/2,side*6.12,0],rim);
  const bearing=p.mesh(rear,`hinge-bearing-${side}`,new THREE.CylinderGeometry(.23,.23,.18,32),rim,[hingeX,side*6.12,hingeZ]);bearing.castShadow=false;
  const pin=p.mesh(lid,`hinge-pin-${side}`,new THREE.CylinderGeometry(.105,.105,.25,24),rim,[0,side*6.12,0]);pin.castShadow=false;
  for(const [i,x]of [2.05,10.75].entries()){
   const shape=new THREE.Shape();shape.moveTo(-.44,0);shape.absarc(0,0,.44,Math.PI,0,side<0);shape.closePath();
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false,curveSegments:24});
   const clip=p.mesh(lid,`book-clip-${side}-${i}`,geometry,rim,[x,side*6.025,.02]);clip.castShadow=false;
  }
 }
 // This edge is the booklet's side opening when the lid lies on the left.
 // Keep its rim below the paper channel and the closing catches above it.
 box(lid,'lid-fore-edge',[.12,12,.03],[w-.07,0,.36],rim);
 for(const side of [-1,1])box(lid,`lid-latch-${side}`,[.18,.45,.04],[w-.18,side*1.2,.04],rim);
 // The rear inlay is one U-shaped sheet: the two wings meet its horizontal face.
 const backing=p.group('backing',shell,false),z=d.plastic+.018;
 p.plate(backing,'backing-sheet',d.backingWidth,d.backingHeight,d.backingPaper,'backing-inner','backing-outer',{position:[0,0,z]});
 for(const side of [-1,1]){
  const wing=p.group(`backing-wing-${side}`,backing,false);
  wing.position.set(side*d.backingWidth/2,0,z+d.backingSpine/2);
  wing.rotation.y=-side*Math.PI/2;
  p.plate(wing,`backing-spine-${side}`,d.backingSpine,d.backingHeight,d.backingPaper,null,side<0?'spine-left':'spine-right');
 }
 // Fixed transparent strip visible to the left of the booklet through the closed lid.
 box(rear,'hinge-strip',[d.hingeWidth-.08,d.caseHeight-.35,.08],[hingeX-d.hingeWidth/2,0,.74]);
 return {shell,lid,rear,backing};
}
