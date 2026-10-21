import {THREE} from './surfaces.js';
import {d} from './dimensions.js';

// Measurements on the existing rectified photographs at 700 x 700.
// These four boundary curves refine, rather than replace, the source-photo
// homographies in page-boundaries.json. No fixed rectangular inset is used.
const full={top:[[0,0],[175,0],[350,0],[525,0],[700,0]],bottom:[[0,700],[175,700],[350,700],[525,700],[700,700]],left:[[0,0],[0,175],[0,350],[0,525],[0,700]],right:[[700,0],[700,175],[700,350],[700,525],[700,700]]};
export const paperBoundaries={
 'page-10':{bottom:[[0,700],[90,689],[180,686],[350,688],[520,694],[700,700]]},
 'page-14':{bottom:[[0,700],[140,696],[350,697],[540,699],[700,700]]},
 'page-16':{bottom:[[0,700],[160,695],[300,693],[440,695],[570,698],[700,700]]},
 // The fingertip at the very bottom of 19 covers only unprinted margin.
 'page-19':{bottom:[[0,697],[80,695],[150,691],[220,694],[350,698],[700,700]]},
 'page-21':{bottom:[[0,700],[150,697],[350,697],[550,698],[700,700]]},
 'page-22':{
  top:[[26,42],[48,32],[78,21],[108,10],[145,1],[260,0],[450,0],[700,0]],
  bottom:[[0,700],[90,691],[180,687],[350,688],[520,693],[700,700]],
  left:[[26,42],[23,100],[19,180],[14,300],[9,420],[5,540],[0,700]],
  right:full.right,
 },
};
function curve(points,t,axis){
 const first=points[0][axis],last=points.at(-1)[axis],position=first+(last-first)*t;
 let i=0;while(i<points.length-2&&points[i+1][axis]<position)i++;
 const a=points[i],b=points[i+1],s=(position-a[axis])/(b[axis]-a[axis]);
 return [a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s];
}
export function paperCoordinates(id,u,v){
 if(!paperBoundaries[id])return [u,v];
 const e={...full,...paperBoundaries[id]};
 // Connect side endpoints to the measured top/bottom corners.
 const left=e.left.map(p=>[...p]),right=e.right.map(p=>[...p]);
 left[0]=e.top[0];left[left.length-1]=e.bottom[0];right[0]=e.top.at(-1);right[right.length-1]=e.bottom.at(-1);
 const top=curve(e.top,u,0),bottom=curve(e.bottom,u,0),l=curve(left,v,1),r=curve(right,v,1);
 const tl=e.top[0],tr=e.top.at(-1),bl=e.bottom[0],br=e.bottom.at(-1);
 return [0,1].map(k=>((1-v)*top[k]+v*bottom[k]+(1-u)*l[k]+u*r[k]-((1-u)*(1-v)*tl[k]+u*(1-v)*tr[k]+(1-u)*v*bl[k]+u*v*br[k]))/700);
}
export function rectifyPaperFaces(node,index,entry){
 for(const [side,id] of [['front',entry.front],['back',entry.back]]){
  if(!paperBoundaries[id])continue;
  const mesh=node.children.find(n=>n.userData.modelId===`leaf-paper-${index}-${side}`);
  const geometry=new THREE.PlaneGeometry(d.bookWidth,d.bookHeight,64,64),uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++){const [x,y]=paperCoordinates(id,uv.getX(i),1-uv.getY(i));uv.setXY(i,x,1-y);}
  if(side==='back')geometry.rotateY(Math.PI);
  mesh.geometry.dispose();mesh.geometry=geometry;
 }
}
