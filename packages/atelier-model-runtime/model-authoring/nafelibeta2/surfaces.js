import * as THREE from '../../src/discs/interactive/vendor/three.module.js';
export {THREE};
export {rounded,sheet,line} from '../research-bai/geometry.js';
export function clearMaterial(frosted=false){return new THREE.MeshPhysicalMaterial({color:frosted?'#f4f1e7':'#f3f9fa',roughness:frosted?.72:.07,transmission:frosted?.18:.92,transparent:true,opacity:frosted?.96:.75,thickness:frosted?.025:.13,ior:1.47,depthWrite:false,envMapIntensity:1.6,clearcoat:frosted?.18:1,clearcoatRoughness:frosted?.5:.08});}
export function print(p,parent,id,w,h,texture,pos=[0,0,0],{back=false,mirror=false}={}){
 const geo=new THREE.PlaneGeometry(w,h);if(mirror){const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));}
 const mat=p.photo(texture,{transparent:true,alphaTest:.015,depthWrite:false,side:THREE.DoubleSide,roughness:.58});
 const mesh=p.mesh(parent,id,geo,mat,pos);if(back)mesh.rotation.y=Math.PI;mesh.castShadow=false;return mesh;
}
