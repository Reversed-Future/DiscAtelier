import {THREE,clearMaterial,print} from './surfaces.js';
import {d} from './dimensions.js';
import {radialDiffraction} from '../../src/discs/interactive/material-effects.js';
import {discLabelMaterial} from './disc-material.js';
export function addCase(root,p){
 const shell=p.group('case',root);shell.position.z=1.1;
 const lid=p.group('lid',shell);lid.position.set(-6.05,0,.5);
 const glass=clearMaterial(),rim=glass.clone();rim.opacity=.96;rim.transmission=.82;
 const box=(n,id,s,pos,mat=glass)=>{const m=p.box(n,id,s,pos,mat);m.castShadow=false;return m;};
 box(shell,'rear-panel',[14.1,12.5,.15],[0,0,.075]);
 for(const side of [-1,1]){
  box(shell,'side-'+side,[.15,12.5,.6],[side*6.975,0,.425],rim);
  box(shell,'rail-'+side,[13.8,.15,.6],[0,side*6.175,.425],rim);
  box(lid,'lid-rail-'+side,[13.1,.09,.33],[6.55,side*6.06,.20],rim);
  box(lid,'lid-arm-'+side,[1,.16,.28],[-.5,side*6.12,0],rim);
  const bearing=p.mesh(shell,'bearing-'+side,new THREE.CylinderGeometry(.22,.22,.18,24),rim,[-6.05,side*6.12,.5]);bearing.castShadow=false;
  p.mesh(lid,'pin-'+side,new THREE.CylinderGeometry(.10,.10,.22,24),rim,[0,side*6.12,0]).castShadow=false;
  for(const x of [2.1,10.8]){
   const s=new THREE.Shape();s.moveTo(-.4,0);s.absarc(0,0,.4,Math.PI,0,side<0);s.closePath();
   p.mesh(lid,`clip-${side}-${x}`,new THREE.ExtrudeGeometry(s,{depth:.055,bevelEnabled:false}),rim,[x,side*6.025,.14]).castShadow=false;
  }
 }
 box(shell,'spine',[.92,12.1,.08],[-6.55,0,.7]);
 box(lid,'lid-panel',[13.1,12.5,.15],[6.55,0,.425]);
 print(p,lid,'lid-lettering',12.8,12,'lid-ink',[6.55,0,.51],{mirror:true});
 p.plate(lid,'orange-label',5,3.4,.008,'sticker',null,{position:[3.1,3.7,.516]});
 const insert=p.group('insert',lid);insert.position.set(6.55,0,.23);
 box(insert,'transparent-card',[11.8,12.2,.02],[0,0,0]);
 print(p,insert,'insert-letters',11.8,12.2,'insert-ink',[0,0,.014]);
 // Rear shell and tray are a single fixed assembly. No detachable backing.
 print(p,shell,'rear-lettering',13.25,12,'rear-ink',[.43,0,-.008],{back:true});
 for(const [i,[a,b]] of [[-30,30],[48,82],[98,132],[150,210],[228,262],[278,312]].entries()){
  const g=new THREE.TorusGeometry(6.05,.032,8,64,(b-a)*Math.PI/180);g.rotateZ(a*Math.PI/180);
  p.mesh(shell,'disc-stop-'+i,g,rim,[.45,0,.3]).castShadow=false;
 }
 p.mesh(shell,'hub-ring',new THREE.TorusGeometry(1.34,.032,8,80),rim,[.45,0,.22]).castShadow=false;
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6,x=Math.cos(a),y=Math.sin(a);
  const spoke=box(shell,'hub-spoke-'+i,[.78,.07,.06],[.45+x*.85,y*.85,.23],rim);spoke.rotation.z=a;
  const tooth=box(shell,'hub-tooth-'+i,[.13,.10,.17],[.45+x*.70,y*.70,.35],rim);tooth.rotation.z=a;
 }
 const disc=p.group('disc',shell);disc.position.set(.45,0,.41);
 const silver=new THREE.MeshPhysicalMaterial({color:'#e0e7e9',metalness:.94,roughness:.14,clearcoat:1,envMapIntensity:2});radialDiffraction(silver);
 const geo=new THREE.RingGeometry(1.7,6,144);const pos=geo.attributes.position,uv=geo.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/12+.5,pos.getY(i)/12+.5);
 p.mesh(disc,'disc-label',geo,discLabelMaterial(p.textures.disc),[0,0,.06]);
 const back=p.mesh(disc,'disc-silver',new THREE.RingGeometry(1.7,6,144),silver,[0,0,-.06]);back.rotation.y=Math.PI;
 const s=new THREE.Shape();s.absarc(0,0,1.7,0,2*Math.PI);const hole=new THREE.Path();hole.absarc(0,0,.75,0,2*Math.PI,true);s.holes.push(hole);
 const hub=new THREE.ExtrudeGeometry(s,{depth:.12,bevelEnabled:false,curveSegments:40});hub.translate(0,0,-.06);p.mesh(disc,'disc-clear-hub',hub,glass).castShadow=false;
 const edge=new THREE.CylinderGeometry(6,6,.12,144,1,true);edge.rotateX(Math.PI/2);p.mesh(disc,'disc-edge',edge,silver);
 return {shell,lid,insert,disc};
}
