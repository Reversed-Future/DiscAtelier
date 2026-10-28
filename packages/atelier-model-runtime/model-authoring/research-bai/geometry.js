import * as THREE from '../../src/discs/interactive/vendor/three.module.js';
export {THREE};
export const paperThickness=.028;
export function rounded(w,h,r=.18,y=0){
 const s=new THREE.Shape(),l=-w/2,b=y,t=y+h,a=w/2;
 s.moveTo(l+r,b);s.lineTo(a-r,b);s.quadraticCurveTo(a,b,a,b+r);s.lineTo(a,t-r);s.quadraticCurveTo(a,t,a-r,t);s.lineTo(l+r,t);s.quadraticCurveTo(l,t,l,t-r);s.lineTo(l,b+r);s.quadraticCurveTo(l,b,l+r,b);return s;
}
export function polygon(points){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
export function sheet(p,parent,id,shape,front,back=front,thickness=paperThickness,{flip='horizontal'}={}){
 const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:24});g.translate(0,0,-thickness/2);
 const edge=back.clone();edge.map=null;
 const indices=[],norm=g.attributes.normal;
 for(let i=0;i<norm.count;i+=3)if(Math.abs(norm.getZ(i))<.5)indices.push(i,i+1,i+2);
 g.setIndex(indices);g.clearGroups();p.mesh(parent,id+'-edge',g,edge);
 const bounds=new THREE.Box2().setFromPoints(shape.getPoints(48)),size=bounds.getSize(new THREE.Vector2());
 for(const [mat,sign]of [[front,1],[back,-1]]){
  const geo=new THREE.ShapeGeometry(shape,24),pos=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<pos.count;i++){let u=(pos.getX(i)-bounds.min.x)/size.x,v=(pos.getY(i)-bounds.min.y)/size.y;if(sign<0){if(flip==='vertical')v=1-v;else u=1-u;}uv.setXY(i,u,v);}
  if(sign<0){const a=geo.index;for(let i=0;i<a.count;i+=3){const b=a.getX(i+1);a.setX(i+1,a.getX(i+2));a.setX(i+2,b);}geo.computeVertexNormals();}
  const m=p.mesh(parent,id+(sign>0?'-front':'-back'),geo,mat,[0,0,sign*thickness/2]);if(mat.transparent)m.castShadow=false;
 }
}
export function materials(){
 const canvas=(typeof document==='undefined'?new OffscreenCanvas(1,1):document.createElement('canvas'));canvas.width=canvas.height=128;const c=canvas.getContext('2d'),im=c.createImageData(128,128);let seed=2314;
 for(let i=0;i<im.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=115+(seed%25);im.data.set([v,v,v,255],i);}c.putImageData(im,0,0);
 const grain=new THREE.CanvasTexture(canvas);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(6,6);
 return {caseBlack:new THREE.MeshStandardMaterial({color:'#080808',roughness:.83,bumpMap:grain,bumpScale:.008}),navy:new THREE.MeshStandardMaterial({color:'#151b31',roughness:.83,bumpMap:grain,bumpScale:.008}),orange:new THREE.MeshStandardMaterial({color:'#c4340d',roughness:.85}),white:new THREE.MeshStandardMaterial({color:'#eeeee4',roughness:.9}),rubber:new THREE.MeshStandardMaterial({color:'#080808',roughness:.95}),metal:new THREE.MeshPhysicalMaterial({color:'#ced2d2',metalness:1,roughness:.19,envMapIntensity:2})};
}
export function line(p,parent,id,points,radius,material){
 const curve=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)));return p.mesh(parent,id,new THREE.TubeGeometry(curve,90,radius,8,false),material);
}
export function decal(p,parent,id,w,h,position,texture,back=false){
 const m=p.mesh(parent,id,new THREE.PlaneGeometry(w,h),p.photo(texture,{roughness:.8}),position);if(back)m.rotation.x=Math.PI;return m;
}
