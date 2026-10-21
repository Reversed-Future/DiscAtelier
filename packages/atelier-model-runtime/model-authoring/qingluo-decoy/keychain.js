import {THREE} from './surfaces.js';
import {dimensions as d} from './dimensions.js';

import {contourPoints,hangingHole} from './keychain-contours.js';
const [outline,figure,leftNote,rightNote]=['outline','figure','leftNote','rightNote'].map(contourPoints);
const scale=d.charmHeight/(486-242),center=[287,364];
function point([x,y]){return [(x-center[0])*scale,(center[1]-y)*scale];}
function shape(points){const s=new THREE.Shape();points.map(point).forEach(([x,y],i)=>s[i?'lineTo':'moveTo'](x,y));s.closePath();return s;}
function artworkGeometry(points){
 const geometry=new THREE.ShapeGeometry(shape(points)),p=geometry.attributes.position,uv=geometry.attributes.uv;
 for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)/scale+center[0])/700,1-(center[1]-p.getY(i)/scale)/525);
 return geometry;
}
export function addKeychain(parent,p){
 const keychain=p.group('keychain',parent),body=shape(outline),hole=new THREE.Path(),[hx,hy]=point(hangingHole);
 hole.absarc(hx,hy,.074,0,Math.PI*2,true);body.holes.push(hole);
 const clear=new THREE.MeshPhysicalMaterial({color:'#f9fcff',transmission:.97,roughness:.065,thickness:d.charmThickness,ior:1.49,transparent:true,opacity:.24,depthWrite:false,envMapIntensity:1.45,side:THREE.FrontSide});
 const solid=new THREE.ExtrudeGeometry(body,{depth:d.charmThickness,bevelEnabled:true,bevelSize:.018,bevelThickness:.012,bevelSegments:2,curveSegments:24});solid.translate(0,0,-d.charmThickness/2);
 p.mesh(keychain,'keychain-acrylic',solid,clear).castShadow=false;
 const print=new THREE.MeshPhysicalMaterial({map:p.textures['keychain-art'],color:'#dedede',side:THREE.DoubleSide,roughness:.83,specularIntensity:.08,envMapIntensity:.12});
 for(const [i,polygon]of [figure,leftNote,rightNote].entries())p.mesh(keychain,'keychain-print-'+i,artworkGeometry(polygon),print,[0,0,0]);
 const metal=new THREE.MeshPhysicalMaterial({color:'#bfc2c6',metalness:.97,roughness:.23,envMapIntensity:1.8});
 const wire=[];for(let i=0;i<=192;i++){const a=i/192*Math.PI*3.85,r=d.ringDiameter/2-.055;wire.push(new THREE.Vector3(r*Math.sin(a),6.65+r*Math.cos(a),.09*(i/192-.5)));}
 p.mesh(keychain,'keychain-split-ring',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire),192,.055,10,false),metal);
 for(let i=0;i<7;i++){
  const curve=new THREE.EllipseCurve(0,0,.14,.30,0,Math.PI*2,false,0),points=curve.getPoints(36).map(v=>new THREE.Vector3(v.x,v.y,0));
  const link=p.mesh(keychain,'keychain-link-'+i,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),40,.038,8,true),metal,[hx,2.65+i*.45,.04]);
  link.rotation.y=i%2?1.15:-.2;
 }
 keychain.position.set(-3,-19,.3);return keychain;
}

