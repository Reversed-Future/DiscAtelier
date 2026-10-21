import {THREE,clearMaterial,print,rounded,sheet,line} from './surfaces.js';
import {bagLabelGeometry} from './bag-label.js';
import {addPoster} from './poster.js';
export function addContents(root,p){
 const band=p.group('band',root);band.position.z=1.12;
 const orange=new THREE.MeshStandardMaterial({color:'#ed6814',roughness:.58});
 const profile=new THREE.Shape();profile.moveTo(-7.4,-1.22);profile.lineTo(7.4,-1.22);profile.quadraticCurveTo(7.65,-1.22,7.65,-.97);profile.lineTo(7.65,.92);profile.quadraticCurveTo(7.65,1.17,7.4,1.17);profile.lineTo(-7.4,1.17);profile.quadraticCurveTo(-7.65,1.17,-7.65,.92);profile.lineTo(-7.65,-.97);profile.quadraticCurveTo(-7.65,-1.22,-7.4,-1.22);
 const hole=new THREE.Path();hole.moveTo(-7.35,-1.12);hole.lineTo(-7.55,-.92);hole.lineTo(-7.55,.88);hole.lineTo(-7.35,1.06);hole.lineTo(7.35,1.06);hole.lineTo(7.55,.88);hole.lineTo(7.55,-.92);hole.lineTo(7.35,-1.12);hole.closePath();profile.holes.push(hole);
 const bg=new THREE.ExtrudeGeometry(profile,{depth:.7,bevelEnabled:false,curveSegments:12});bg.rotateX(Math.PI/2);bg.translate(0,.35,0);p.mesh(band,'elastic-loop',bg,orange);
 const bag=p.group('bag',root);bag.position.z=.20;
 const frost=clearMaterial(true),seam=frost.clone();seam.opacity=1;seam.transmission=.04;
 const front=p.group('bag-front',bag),back=p.group('bag-back',bag);front.position.z=.22;back.position.z=-.16;
 for(const [node,id] of [[front,'bag-front-film'],[back,'bag-back-film']]){
  sheet(p,node,id,rounded(15,14.5,.15,-7.25),frost,frost,.018);
 }
 print(p,front,'bag-title',15,14.5,'bag-front',[0,0,.014]);
 const label=p.mesh(back,'bag-label',bagLabelGeometry(),p.photo('bag-label'),[2.9,-5.2,-.02]);label.rotation.y=Math.PI;
 for(const x of [-7.35,7.35])p.box(bag,'bag-seam-'+x,[.13,14.2,.36],[x,0,.03],seam).castShadow=false;
 p.box(bag,'bag-base-seam',[14.7,.13,.36],[0,-7.15,.03],seam).castShadow=false;
 const zip=p.group('zip',bag);zip.position.y=6.3;
 for(const z of [-.13,.21])line(p,zip,'zip-track-'+z,[[-7.25,0,z],[0,0,z],[7.25,0,z]],.055,seam).castShadow=false;
 const items={};
 for(const [id,w,h,z,tex] of [['yellow',9,2.5,.14,'yellow'],['polaroid-1',7.6,10.2,.10,'polaroid-1'],['polaroid-2',7.6,10.2,.06,'polaroid-2']]){
  const n=p.group(id,bag);n.position.set(id==='yellow'?-1.5:0,id==='yellow'?-4.3:-.25,z);
  const backmat=id==='yellow'?new THREE.MeshStandardMaterial({color:'#e7d939',roughness:.86}):p.white;
  sheet(p,n,id+'-paper',rounded(w,h,id==='yellow'?.18:.025,-h/2),p.photo(tex),backmat,.024);items[id]=n;
 }
 return {band,bag,bagFront:front,bagBack:back,zip,...addPoster(bag,p),...items};
}
