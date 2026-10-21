import {THREE} from './surfaces.js';
import {radialDiffraction} from '../../src/discs/interactive/material-effects.js';

export function annulus(inner,outer,back=false){
 const g=new THREE.RingGeometry(inner,outer,160),pos=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/(outer*2)+.5,pos.getY(i)/(outer*2)+.5);
 if(back)g.rotateY(Math.PI);
 return g;
}
export function addDisc(shell,p){
 const tray=p.group('tray',shell,false);
 const clear=new THREE.MeshPhysicalMaterial({color:'#eef3f1',roughness:.07,transmission:.9,thickness:.08,ior:1.49,transparent:true,opacity:.8,depthWrite:false,envMapIntensity:1.7});
 p.box(tray,'tray-floor',[12.7,12.15,.055],[.5,0,.275],clear).castShadow=false;
 // The photographed tray is a fixed single-disc tray with a continuous seat.
 for(let i=0;i<4;i++){
  const arc=p.mesh(tray,'tray-rim-'+i,new THREE.TorusGeometry(6.07,.038,8,70,Math.PI/2-.16),clear,[.5,0,.33]);
  arc.rotation.z=i*Math.PI/2+.08;arc.castShadow=false;
 }
 const hub=p.mesh(tray,'tray-hub-base',new THREE.CylinderGeometry(.87,.91,.10,80),clear,[.5,0,.345]);hub.rotation.x=Math.PI/2;hub.castShadow=false;
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6,spoke=p.box(tray,'tray-hub-tooth-'+i,[.12,.48,.16],[.5+Math.sin(a)*.47,Math.cos(a)*.47,.45],clear);spoke.rotation.z=-a;spoke.castShadow=false;
 }
 const disc=p.group('disc',shell);disc.position.set(.5,0,.46);
 const label=new THREE.MeshPhysicalMaterial({map:p.textures['disc-label'],color:'#dedede',roughness:.65,metalness:0,specularIntensity:.25,envMapIntensity:.3});
 p.mesh(disc,'disc-print',annulus(1.20,6),label,[0,0,.06]);
 const silver=new THREE.MeshPhysicalMaterial({color:'#dde1e3',metalness:.96,roughness:.17,envMapIntensity:1.7,clearcoat:1});radialDiffraction(silver);
 p.mesh(disc,'disc-silver',annulus(1.2,6,true),silver,[0,0,-.06]);
 const edge=p.mesh(disc,'disc-outer-edge',new THREE.CylinderGeometry(6,6,.12,160,1,true),silver);edge.rotation.x=Math.PI/2;
 p.mesh(disc,'disc-clear-center',annulus(.75,1.2),clear,[0,0,.055]);
 p.mesh(disc,'disc-clear-center-back',annulus(.75,1.2,true),clear,[0,0,-.055]);
 const hole=p.mesh(disc,'disc-hole-edge',new THREE.CylinderGeometry(.75,.75,.12,80,1,true),clear);hole.rotation.x=Math.PI/2;
 return {disc,tray};
}
