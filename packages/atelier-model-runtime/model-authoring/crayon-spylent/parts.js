import * as THREE from '../../src/discs/interactive/vendor/three.module.js';
export function makeParts(root,textures){
  const white=new THREE.MeshStandardMaterial({color:'#f0eee7',roughness:.88}),black=new THREE.MeshStandardMaterial({color:'#282a29',roughness:.92});
  const photo=(id,values={})=>new THREE.MeshStandardMaterial({map:textures[id],roughness:.86,envMapIntensity:.3,...values});
  function group(id,parent=root,pickable=true){const n=new THREE.Group();n.userData.modelId=id;if(pickable)n.userData.item=id;parent.add(n);return n;}
  function mesh(parent,id,geometry,material,position=[0,0,0]){const n=new THREE.Mesh(geometry,material);n.userData.modelId=id;n.position.fromArray(position);n.castShadow=true;n.receiveShadow=true;parent.add(n);return n;}
  const box=(parent,id,size,position,material=white)=>mesh(parent,id,new THREE.BoxGeometry(...size),material,position);
  function shape(width,height,notch=0,hole=0){const x=width/2,y=height/2,s=new THREE.Shape();s.moveTo(-x,-y+notch);if(notch){s.lineTo(-x+notch,-y+notch);s.lineTo(-x+notch,-y);}s.lineTo(x,-y);s.lineTo(x,y);s.lineTo(-x,y);s.closePath();if(hole){const h=hole/2,p=new THREE.Path();p.moveTo(-h,-h);p.lineTo(-h,h);p.lineTo(h,h);p.lineTo(h,-h);p.closePath();s.holes.push(p);}return s;}
  function plate(parent,id,width,height,thickness,front=null,back=null,{notch=0,hole=0,position=[0,0,0],edge=white,backFlip='horizontal'}={}){
    const outline=shape(width,height,notch,hole),g=new THREE.ExtrudeGeometry(outline,{depth:thickness,bevelEnabled:false,curveSegments:24});g.translate(0,0,-thickness/2);
    // Side walls only; separate front/back faces each carry one photograph.
    g.clearGroups();const normal=g.attributes.normal,index=[];
    for(let i=0;i<normal.count;i+=3)if(Math.abs(normal.getZ(i))<.5)index.push(i,i+1,i+2);
    g.setIndex(index);mesh(parent,`${id}-edge`,g,edge,position);
    for(const [side,texture,sign]of [['front',front,1],['back',back,-1]]){
      const face=new THREE.ShapeGeometry(outline,24),p=face.attributes.position,uv=face.attributes.uv;
      for(let i=0;i<p.count;i++){const u=p.getX(i)/width+.5,v=p.getY(i)/height+.5;uv.setXY(i,sign===-1&&backFlip==='horizontal'?1-u:u,sign===-1&&backFlip==='vertical'?1-v:v);}
      if(sign<0){const a=face.index;for(let i=0;i<a.count;i+=3){const b=a.getX(i+1);a.setX(i+1,a.getX(i+2));a.setX(i+2,b);}face.computeVertexNormals();}
      mesh(parent,`${id}-${side}`,face,texture?photo(texture):edge,[position[0],position[1],position[2]+sign*thickness/2]);
    }
  }
  return {group,mesh,box,plate,shape,photo,white,black,textures};
}
