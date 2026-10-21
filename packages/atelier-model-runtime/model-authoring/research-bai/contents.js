import {THREE,rounded,polygon,sheet} from './geometry.js';
import {radialDiffraction} from '../../src/discs/interactive/material-effects.js';
import {addEnvelope} from './envelope.js';
export function addContents(root,p,m,holes){
 const envelopeParts=addEnvelope(root,p),{envelope}=envelopeParts;
 const disc=p.group('disc',envelope);addDisc(p,disc);
 const poster=p.group('poster',root);poster.position.set(0,0,.12);poster.rotation.z=Math.PI/2;
 const columns={},rows=[],pw=40/3,ph=18;
 for(let c=0;c<3;c++){
  const column=p.group('poster-column-'+c,poster,false);const side=c-1;
  column.userData.foldHeight=c===0?.07:c===2?.15:0;column.position.set(side*pw/2,0,column.userData.foldHeight);column.rotation.y=side===-1?Math.PI:side===1?-Math.PI:0;
  const columnCenter=p.group('poster-column-center-'+c,column,false);columnCenter.position.x=side*pw/2;
  columns[c]=column;
  for(let r=0;r<3;r++){
   const sign=1-r,pivot=p.group('poster-row-'+r+'-'+c,columnCenter,false);pivot.userData.foldHeight=r===0?.026:r===2?.055:0;pivot.position.set(0,sign*ph/2,pivot.userData.foldHeight);pivot.rotation.x=sign*Math.PI;
   const panel=p.group('poster-panel-'+r+'-'+c,pivot,false);panel.position.y=sign*ph/2;
   sheet(p,panel,'poster-paper-'+r+'-'+c,rounded(pw,ph,.001,-ph/2),p.photo('poster-'+String(r*3+c+1).padStart(2,'0')),m.orange,.009);
   if(sign)rows.push({pivot,sign});
  }
 }
 const decoder=p.group('decoder',root);decoder.position.set(0,-.5,.06);decoder.rotation.z=Math.PI/2;
 const shape=rounded(12.9,18.8,.17,-9.4);
 // Outline includes the indexing tab; total width is the measured 13.9 cm.
 const tab=polygon([[6.44,2.4],[7.44,3.4],[7.44,9.2],[7.25,9.4],[6.44,9.4]]);
 for(const h of holes){const x=h.x*12.9/13.9,w=h.w*12.9/13.9;const path=new THREE.Path();path.moveTo(x-w/2,h.y-h.h/2);path.lineTo(x-w/2,h.y+h.h/2);path.lineTo(x+w/2,h.y+h.h/2);path.lineTo(x+w/2,h.y-h.h/2);path.closePath();shape.holes.push(path);}
 const red=new THREE.MeshPhysicalMaterial({color:'#ff0718',roughness:.018,metalness:0,transparent:true,opacity:1,transmission:1,thickness:.025,attenuationColor:'#ff0014',attenuationDistance:.018,ior:1.46,specularIntensity:.25,envMapIntensity:.22,depthWrite:false});
 sheet(p,decoder,'decoder-body',shape,red,red,.025);sheet(p,decoder,'decoder-tab',tab,red,red,.025);
 return {...envelopeParts,disc,poster,columns,rows,decoder};
}
function addDisc(p,disc){
 const ring=new THREE.RingGeometry(1.23,6,144),pos=ring.attributes.position,uv=ring.attributes.uv;
 for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/12+.5,pos.getY(i)/12+.5);
 p.mesh(disc,'disc-label',ring,p.photo('disc',{roughness:.45}),[0,0,.06]);
 const silver=new THREE.MeshPhysicalMaterial({color:'#e3e7e8',metalness:.95,roughness:.12,envMapIntensity:2,clearcoat:1});radialDiffraction(silver);
 const back=p.mesh(disc,'disc-silver',new THREE.RingGeometry(1.23,6,144),silver,[0,0,-.06]);back.rotation.y=Math.PI;
 const clear=new THREE.MeshPhysicalMaterial({color:'#eceeef',transparent:true,opacity:.6,transmission:.92,roughness:.09,thickness:.12,depthWrite:false});
 const s=new THREE.Shape();s.absarc(0,0,1.23,0,Math.PI*2);const h=new THREE.Path();h.absarc(0,0,.75,0,Math.PI*2,true);s.holes.push(h);
 const hub=new THREE.ExtrudeGeometry(s,{depth:.12,bevelEnabled:false,curveSegments:48});hub.translate(0,0,-.06);p.mesh(disc,'disc-hub',hub,clear).castShadow=false;
 const edge=new THREE.CylinderGeometry(6,6,.12,144,1,true);edge.rotateX(Math.PI/2);p.mesh(disc,'disc-edge',edge,silver);
}
