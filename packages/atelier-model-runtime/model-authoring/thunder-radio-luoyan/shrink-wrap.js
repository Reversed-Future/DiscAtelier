import {THREE} from './surfaces.js';

function filmSurface(width,height){
 const geometry=new THREE.PlaneGeometry(width,height,100,140),points=geometry.attributes.position;
 for(let i=0;i<points.count;i++){
  const x=points.getX(i),y=points.getY(i),u=x/width*2,v=y/height*2;
  const edgeX=Math.exp(-Math.pow((1-Math.abs(u))/.08,2));
  const edgeY=Math.exp(-Math.pow((1-Math.abs(v))/.07,2));
  // Stretched center, gathered folds along heat seals and diagonal corner fans.
  const center=.0002*Math.sin(x*6+y*4);
  const gathered=.004*edgeY*Math.sin(x*13+y*8+Math.sin(x*7))+.002*edgeX*Math.sin(y*16+x*9);
  const corner=.007*edgeX*edgeY*Math.sin((x+y)*23);
  const border=Math.min(1,(1-Math.abs(u))*40,(1-Math.abs(v))*40);
  points.setZ(i,.02+Math.max(0,border)*(center+gathered+corner));
 }
 geometry.computeVertexNormals();return geometry;
}

export function addShrinkWrap(p,parent,faces){
 const material=new THREE.MeshPhysicalMaterial({color:'#ffffff',roughness:.035,metalness:0,
  transmission:1,thickness:.002,ior:1.46,specularIntensity:1,envMapIntensity:1,
  clearcoat:.07,clearcoatRoughness:.08,depthWrite:false,side:THREE.FrontSide});
 const wrap=p.group('sealed-film',parent,false);
 for(const [id,width,height,position,rotation]of faces){
  const mesh=p.mesh(wrap,'film-'+id,filmSurface(width,height),material,position);
  mesh.rotation.set(...rotation);mesh.castShadow=false;mesh.receiveShadow=false;
 }
 return wrap;
}
