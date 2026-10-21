import {THREE} from './surfaces.js';
import {d} from './dimensions.js';
import {silkMaterial} from './cloth-material.js';
import {clothHeight,floorHeight,lipRadius} from './cloth-shape.js';
import {addCornerTucks} from './cloth-tucks.js';

function patch(p,parent,id,material,point,uv,nx,ny){
 const vertices=[],uvs=[],indices=[];
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny;vertices.push(...point(u,v));uvs.push(...uv(u,v));}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1;if(id==='silk-floor')indices.push(a,b,c,b,c+1,c);else indices.push(a,c,b,b,c,c+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
 return p.mesh(parent,id,geo,material);
}
export function addTray(p,parent,m){
 const tray=p.group('tray',parent),w=d.trayWidth,h=d.trayHeight;
 p.box(tray,'tray-bottom',[w,h,.14],[0,0,.07],m.paper);
 for(const sign of [-1,1]){
  p.box(tray,'tray-side-'+sign,[d.rim,h,d.trayDepth],[sign*(w-d.rim)/2,0,d.trayDepth/2],m.paper);
  p.box(tray,'tray-end-'+sign,[w-2*d.rim,d.rim,d.trayDepth],[0,sign*(h-d.rim)/2,d.trayDepth/2],m.paper);
 }
 const silk=p.group('silk',tray,false),mat=silkMaterial();
 const ow=(w-2*d.rim)/2,oh=(h-2*d.rim)/2,iw=(d.cassetteWidth+.08)/2,ih=(d.cassetteHeight+.08)/2;
 const inner=[[-iw,-ih],[iw,-ih],[iw,ih],[-iw,ih]],outer=[[-ow,-oh],[ow,-oh],[ow,oh],[-ow,oh]];
 for(let side=0;side<4;side++){
  const next=(side+1)%4,a=inner[side],b=inner[next],c=outer[side],e=outer[next];
  const xy=(u,v)=>{
   const x=THREE.MathUtils.lerp(a[0],b[0],u),y=THREE.MathUtils.lerp(a[1],b[1],u),radius=lipRadius(x,y);
   return [THREE.MathUtils.lerp(x*(1+radius/iw),THREE.MathUtils.lerp(c[0],e[0],u),v),THREE.MathUtils.lerp(y*(1+radius/ih),THREE.MathUtils.lerp(c[1],e[1],u),v)];
  };
  patch(p,silk,'silk-drape-'+side,mat,(u,v)=>{const [x,y]=xy(u,v);return[x,y,clothHeight(x,y)];},(u,v)=>{const [x,y]=xy(u,v);return[x/(2*ow)+.5,y/(2*oh)+.5];},160,64);
  patch(p,silk,'silk-well-'+side,mat,(u,v)=>{
   const x=THREE.MathUtils.lerp(a[0],b[0],u),y=THREE.MathUtils.lerp(a[1],b[1],u);
   const [tx,ty]=xy(u,0),top=clothHeight(tx,ty),radius=lipRadius(x,y);
   const arc=Math.max(0,(v-.78)/.22)*Math.PI/2,outset=radius*(1-Math.cos(arc));
   // Outward-only folds keep the cavity clear of the inserted cassette.
   const ripple=.06*(1+Math.sin(u*19+side+.7*Math.sin(u*13)))*Math.sin(Math.PI*v);
   const z=v<.78?THREE.MathUtils.lerp(d.wellFloor,top-radius,v/.78):top-radius+radius*Math.sin(arc);
   return[x*(1+(outset+ripple)/iw),y*(1+(outset+ripple)/ih),z];
  },(u,v)=>[u,v],128,24);
 }
 patch(p,silk,'silk-floor',mat,(u,v)=>{
  return[(u-.5)*2*iw,(v-.5)*2*ih,floorHeight(u,v,d.wellFloor)];
 },(u,v)=>[u,v],80,110);
 addCornerTucks(p,silk,mat,patch);
 tray.position.z=.075;return {tray,silk};
}
