import {THREE,rounded,polygon,sheet,line} from './geometry.js';

export const envelopeSize={half:6.35,skin:.018,frontZ:.12,backZ:-.12,fold:.28,flap:3.7,notch:1.15};
export function addEnvelope(root,p){
 const s=envelopeSize,envelope=p.group('envelope',root);envelope.position.set(0,0,.45);envelope.rotation.z=Math.PI/2;
 const frosted=new THREE.MeshPhysicalMaterial({color:'#cbd0d2',roughness:.65,transparent:true,opacity:.48,transmission:.2,thickness:.025,ior:1.45,depthWrite:false});
 const front=p.group('envelope-front',envelope,false);front.position.z=s.frontZ;
 sheet(p,front,'envelope-front',rounded(12.7,12.7,.12,-s.half),frosted,frosted,s.skin);
 const backShape=new THREE.Shape();backShape.moveTo(-6.23,-s.half);backShape.lineTo(6.23,-s.half);backShape.quadraticCurveTo(s.half,-s.half,s.half,-6.23);backShape.lineTo(s.half,6.23);backShape.quadraticCurveTo(s.half,s.half,6.23,s.half);backShape.lineTo(s.notch,s.half);backShape.absarc(0,s.half,s.notch,0,Math.PI,true);backShape.lineTo(-6.23,s.half);backShape.quadraticCurveTo(-s.half,s.half,-s.half,6.23);backShape.lineTo(-s.half,-6.23);backShape.quadraticCurveTo(-s.half,-s.half,-6.23,-s.half);
 const back=p.group('envelope-back',envelope,false);back.position.z=s.backZ;
 sheet(p,back,'envelope-back',backShape,frosted,frosted,s.skin);
 const ink=new THREE.MeshStandardMaterial({map:p.textures['envelope-ink'],transparent:true,depthWrite:false,roughness:.9});p.mesh(envelope,'envelope-print',new THREE.PlaneGeometry(12.7,12.7),ink,[0,0,.135]).castShadow=false;
 for(const x of [-6.15,6.15])line(p,envelope,'envelope-seam-'+x,[[x,-6.25,-.05],[x,5.9,-.05]],.035,frosted);
 // The closure grows from the printed front, bridges the pocket thickness,
 // then folds down on the back. Both hinges remain physically joined.
 const flapFold=p.group('envelope-flap',envelope);flapFold.position.set(0,s.half,s.frontZ);flapFold.rotation.x=-Math.PI/2;
 sheet(p,flapFold,'envelope-fold-strip',polygon([[-5.95,0],[5.95,0],[5.95,s.fold],[-5.95,s.fold]]),frosted,frosted,s.skin);
 const flap=p.group('envelope-flap-face',flapFold,false);flap.position.y=s.fold;flap.rotation.x=-Math.PI/2;
 const shape=new THREE.Shape();shape.moveTo(-5.95,0);shape.lineTo(5.95,0);shape.lineTo(5.95,3.2);shape.quadraticCurveTo(5.95,s.flap,5.45,s.flap);shape.lineTo(-5.45,s.flap);shape.quadraticCurveTo(-5.95,s.flap,-5.95,3.2);shape.closePath();
 sheet(p,flap,'envelope-flap',shape,frosted,frosted,s.skin);
 return {envelope,flap,flapFold};
}
export function envelopeFoldAngles(parts,opening){const angle=opening?0:-Math.PI/2;return [[parts.flapFold,'x',angle],[parts.flap,'x',angle]];}
