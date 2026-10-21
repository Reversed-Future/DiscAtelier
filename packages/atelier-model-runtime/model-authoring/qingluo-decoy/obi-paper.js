import * as THREE from '../../src/discs/interactive/vendor/three.module.js';

// A pressed fold changes the paper's surface normal on both sides. Keep the
// neutral surface at zero at the hinge, so the flaps still turn at their edges.
export function addObiPaper(p,parent,id,width,height,thickness,front,back,paper,{x=0,left=false,right=false}={}){
 const reach=.08,relief=.014;
 const columns=[-width/2,width/2];
 for(let i=1;i<=12;i++){
  if(left)columns.push(-width/2+reach*i/12);
  if(right)columns.push(width/2-reach*i/12);
 }
 columns.sort((a,b)=>a-b);
 const rise=u=>{
  const distance=Math.min(left?u+width/2:Infinity,right?width/2-u:Infinity);
  const t=THREE.MathUtils.clamp(distance/reach,0,1);
  return relief*t*t*(3-2*t);
 };
 for(const [side,texture,sign]of [['front',front,1],['back',back,-1]]){
  const vertices=[],uv=[],indices=[],colors=[];
  for(const u of columns)for(const v of [-height/2,height/2]){
   vertices.push(u,v,rise(u)+sign*thickness/2);
   uv.push(sign>0?u/width+.5:.5-u/width,v/height+.5);
   // Subtle occlusion inside the pressed groove keeps it legible under the
   // viewer's soft fill light. The original printed texture stays intact.
   const shade=sign>0?.8+.2*rise(u)/relief:1;
   colors.push(shade,shade,shade);
  }
  for(let i=0;i<columns.length-1;i++){
   const a=i*2,b=a+2;
   indices.push(...(sign>0?[a,b,a+1,b,b+1,a+1]:[a,a+1,b,b,a+1,b+1]));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const material=texture?p.photo(texture):paper.clone();material.vertexColors=true;
  p.mesh(parent,`${id}-${side}`,g,material,[x,0,0]);
 }
 // Close the actual curved paper thickness, including the top/bottom edges.
 const outline=new THREE.Shape();
 columns.forEach((u,i)=>outline[i?'lineTo':'moveTo'](u,rise(u)+thickness/2));
 for(const u of [...columns].reverse())outline.lineTo(u,rise(u)-thickness/2);
 outline.closePath();
 const edge=new THREE.ExtrudeGeometry(outline,{depth:height,bevelEnabled:false});
 edge.clearGroups();const indices=[],normal=edge.attributes.normal;
 for(let i=0;i<normal.count;i+=3){
  // Retain the end caps and the two vertical fold edges; the broad faces
  // above carry the photographs and must not overlap an extra solid surface.
  if(Math.abs(normal.getZ(i))>.5||Math.abs(normal.getX(i))>.99)indices.push(i,i+1,i+2);
 }
 edge.setIndex(indices);edge.rotateX(Math.PI/2);edge.translate(0,height/2,0);
 p.mesh(parent,`${id}-edge`,edge,paper,[x,0,0]);
}
