import {THREE} from './surfaces.js';
import {d} from './dimensions.js';
import {addShrinkWrap} from './shrink-wrap.js';
export function addCassette(p,parent,m){
 const cassette=p.group('cassette',parent),w=d.cassetteWidth,h=d.cassetteHeight,z=d.cassetteDepth;
 // Six individually photographed faces; the shrink-wrapped case stays closed.
 const faces=[['front',w,h,[0,0,z/2],[0,0,0]],['back',w,h,[0,0,-z/2],[0,Math.PI,0]],
 ['left',z,h,[-w/2,0,0],[0,-Math.PI/2,0]],['right',z,h,[w/2,0,0],[0,Math.PI/2,0]],
 ['top',z,w,[0,h/2,0],[-Math.PI/2,0,Math.PI/2]],['bottom',z,w,[0,-h/2,0],[Math.PI/2,0,Math.PI/2]]];
 for(const [id,width,height,position,rotation]of faces){
  const face=p.mesh(cassette,'cassette-'+id,new THREE.PlaneGeometry(width,height),m.photo('cassette-'+id),position);face.rotation.set(...rotation);
 }
 addShrinkWrap(p,cassette,faces);
 const seam=new THREE.MeshPhysicalMaterial({color:'#e3e8ef',transparent:true,opacity:.16,roughness:.28,depthWrite:false});
 for(const y of [-h/2+.08,h/2-.08]){const line=p.box(cassette,'film-seal-'+y,[w,.012,z+.025],[0,y,0],seam);line.castShadow=false;}
 cassette.position.z=d.wellFloor+z/2+.025;return cassette;
}
