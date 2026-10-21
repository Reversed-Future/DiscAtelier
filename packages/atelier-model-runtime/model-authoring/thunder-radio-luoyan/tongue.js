import {THREE} from './surfaces.js';
import {d} from './dimensions.js';

export function addFlexibleTongue(p,parent,material){
 const nx=28,ny=48,vertices=[],indices=[],count=(nx+1)*(ny+1),half=(d.width-.25)/2,r=.45;
 for(const side of [-1,1])for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const y=d.tongue*j/ny,corner=Math.max(0,y-(d.tongue-r)),width=half-r+Math.sqrt(r*r-corner*corner);
  vertices.push((i/nx*2-1)*width,y,side*d.paper/2);
 }
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const a=j*(nx+1)+i,b=a+1,c=a+nx+1;indices.push(a,c,b,b,c,c+1,a+count,b+count,c+count,b+count,c+1+count,c+count);
 }
 const boundary=[];for(let i=0;i<=nx;i++)boundary.push(i);for(let j=1;j<=ny;j++)boundary.push(j*(nx+1)+nx);for(let i=nx-1;i>=0;i--)boundary.push(ny*(nx+1)+i);for(let j=ny-1;j>0;j--)boundary.push(j*(nx+1));
 for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];indices.push(a,b,a+count,b,b+count,a+count);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=p.mesh(parent,'tongue-paper',geometry,material),base=geometry.attributes.position.clone(),point=new THREE.Vector3();
 return box=>{
  box.updateWorldMatrix(true,true);const toBox=new THREE.Matrix4().copy(box.matrixWorld).invert().multiply(mesh.matrixWorld),fromBox=toBox.clone().invert(),position=geometry.attributes.position;
  for(let i=0;i<base.count;i++){
   point.fromBufferAttribute(base,i).applyMatrix4(toBox);
   // The flexible tongue slides in the gap behind the inner tray. Only its
   // withdrawn part may rise; its hinge stays attached to the end flap.
   if(point.y<d.height/2+.035&&point.z>.04-base.getZ(i))point.z=.04-base.getZ(i);
   point.applyMatrix4(fromBox);position.setXYZ(i,point.x,point.y,point.z);
  }
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 };
}
