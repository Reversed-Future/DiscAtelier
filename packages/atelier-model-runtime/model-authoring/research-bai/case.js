import {THREE,rounded,sheet,decal} from './geometry.js';
export function addCase(root,p,m){
 const body=p.group('case',root),bottom=p.group('case-base',body,false);sheet(p,bottom,'base',rounded(19.6,14.6,.15,-7.3),p.photo('base-inside'),m.caseBlack,.055);
 const flaps={};
 for(const [id,width,length,pos,angle,texture,wall]of [
  ['top',19.6,14.6,[0,7.3,.04],0,'top-inside','wall-top'],
  ['bottom',19.6,10.1,[0,-7.3,.01],Math.PI,'bottom-inside','wall-bottom'],
  ['left',14.6,6,[-9.8,0,0],Math.PI/2,'left-inside','wall-left'],
  ['right',14.6,6,[9.8,0,0],-Math.PI/2,'right-inside','wall-right']]){
  const anchor=p.group('case-'+id,body);anchor.position.fromArray(pos);anchor.rotation.z=angle;
  const wallPivot=p.group(id+'-wall-pivot',anchor,false);wallPivot.rotation.x=Math.PI/2;
  sheet(p,wallPivot,id+'-wall',rounded(width,2.5,.04),p.photo(wall),m.caseBlack,.045);
  const face=p.group(id+'-face-pivot',wallPivot,false);face.position.set(0,2.5,.035);face.rotation.x=Math.PI/2;
  let shape=rounded(width,length,.4);
  if(id==='top'){
   // Side notches hold the continuous horizontal elastic band.
   const a=width/2,r=.4,y=10.4;
   shape=new THREE.Shape();shape.moveTo(-a+r,0);shape.lineTo(a-r,0);shape.quadraticCurveTo(a,0,a,r);shape.lineTo(a,y-.56);shape.quadraticCurveTo(a-.24,y-.5,a-.24,y);shape.quadraticCurveTo(a-.24,y+.5,a,y+.56);shape.lineTo(a,length-r);shape.quadraticCurveTo(a,length,a-r,length);shape.lineTo(-a+r,length);shape.quadraticCurveTo(-a,length,-a,length-r);shape.lineTo(-a,y+.56);shape.quadraticCurveTo(-a+.24,y+.5,-a+.24,y);shape.quadraticCurveTo(-a+.24,y-.5,-a,y-.56);shape.lineTo(-a,r);shape.quadraticCurveTo(-a,0,-a+r,0);
  }
  sheet(p,face,id+'-face',shape,p.photo(texture),m.caseBlack,.045,{flip:'vertical'});
  if(id==='top'){
   decal(p,face,'cover-picture',5.65,7.05,[-6,4.8,-.03],'cover-picture',true);
   decal(p,face,'cover-label',10.1,2.4,[3.7,12.25,-.032],'cover-label',true);
  }
  flaps[id]={anchor,wall:wallPivot,face};
 }
 const band=p.group('band',root);band.position.set(0,-3.1,1.31);
 // Extruded ring in XZ, with its opening modelled all the way through.
 const outer=rounded(20.04,2.98,.25,-1.49),inner=rounded(19.86,2.79,.19,-1.395);
 const hole=new THREE.Path(inner.getPoints(32).reverse());outer.holes.push(hole);
 const geo=new THREE.ExtrudeGeometry(outer,{depth:1.1,bevelEnabled:true,bevelSize:.025,bevelThickness:.02,bevelSegments:2,curveSegments:24});geo.translate(0,0,-.55);geo.rotateX(Math.PI/2);
 p.mesh(band,'band-loop',geo,m.rubber);
 return {body,bottom,flaps,band};
}
