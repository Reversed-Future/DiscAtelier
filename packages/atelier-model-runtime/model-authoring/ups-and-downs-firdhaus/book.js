import * as THREE from '../../src/discs/interactive/vendor/three.module.js';
import {dimensions as d,thickness,leafHeight} from './dimensions.js';

export const leafId=i=>`book-leaf-${i}`;
export const leafMeshIds=i=>['front','back','edge'].map(side=>`${leafId(i)}-${side}`);

function flex(geometry){
 const flat=geometry.attributes.position,bent=flat.clone();
 for(let i=0;i<flat.count;i++)bent.setZ(i,flat.getZ(i)+1.1*Math.sin(Math.PI*flat.getX(i)/d.bookWidth));
 const bentGeometry=geometry.clone();bentGeometry.setAttribute('position',bent);bentGeometry.computeVertexNormals();
 geometry.morphAttributes.position=[bent];geometry.morphAttributes.normal=[bentGeometry.attributes.normal.clone()];
 bentGeometry.dispose();return geometry;
}
function faceGeometry(back,depth){
 const g=new THREE.PlaneGeometry(d.bookWidth,d.bookHeight,48,1);g.translate(d.bookWidth/2,0,(back?-1:1)*depth/2);
 if(back){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));const index=g.index;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}g.computeVertexNormals();}
 return flex(g);
}
function edgeGeometry(depth){
 const vertices=[],indices=[];
 const points=[];for(let i=0;i<=48;i++)points.push([d.bookWidth*i/48,-d.bookHeight/2]);
 points.push([d.bookWidth,d.bookHeight/2]);for(let i=47;i>=0;i--)points.push([d.bookWidth*i/48,d.bookHeight/2]);
 for(const [x,y]of points)vertices.push(x,y,-depth/2,x,y,depth/2);
 for(let i=0;i<points.length;i++){const a=2*i,b=2*((i+1)%points.length);indices.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return flex(g);
}
export function addBook(parent,p){
 const book=p.group('book',parent);
 for(let i=0;i<d.leaves;i++){
  const leaf=p.group(leafId(i),book);leaf.position.set(-d.bookWidth/2,0,leafHeight(i));
  const materials=[p.photo(`book-${i*2}`),p.photo(`book-${i*2+1}`),p.white];
  const geometries=[faceGeometry(false,thickness(i)),faceGeometry(true,thickness(i)),edgeGeometry(thickness(i))];
  leafMeshIds(i).forEach((id,j)=>{const mesh=p.mesh(leaf,id,geometries[j],materials[j]);mesh.updateMorphTargets();});
 }
 const metal=new THREE.MeshStandardMaterial({color:'#bfc2c3',roughness:.3,metalness:.86});
 for(const [i,y]of [-3.4,3.4].entries())p.mesh(book,'book-staple-'+i,new THREE.CylinderGeometry(.012,.012,.43,8),metal,[-d.bookWidth/2,y,0]);
 return book;
}
