import {THREE} from './geometry.js';

export async function spreadCardStack({ids,nodes,positions,root,motion,viewer}){
 root.updateMatrixWorld(true);
 const cards=ids.map(id=>{const node=nodes.get(id);root.attach(node);return {node,from:node.position.clone(),rotation:node.quaternion.clone(),to:new THREE.Vector3(...positions[id])};});
 await motion.tween(t=>{for(const {node,from}of cards)node.position.copy(from).addScaledVector(new THREE.Vector3(0,0,3),t);});
 for(const card of cards)card.from.copy(card.node.position);
 // Frame the destinations once, rather than chasing fourteen separate cards.
 const before=viewer.snapshot();for(const {node,to}of cards){node.position.copy(to);node.quaternion.identity();}root.updateMatrixWorld(true);
 viewer.fit(cards.map(c=>c.node),{preserve:true});const target=viewer.snapshot();
 for(const {node,from,rotation}of cards){node.position.copy(from);node.quaternion.copy(rotation);}root.updateMatrixWorld(true);viewer.restore(before);
 // Keep the stack's thickness offsets until the cards have separated in XY.
 await Promise.all([motion.cameraTo(target),motion.tween(t=>{for(const {node,from,to,rotation}of cards){node.position.lerpVectors(from,to,t);node.position.z=from.z;node.quaternion.slerpQuaternions(rotation,new THREE.Quaternion(),t);}})]);
 await motion.tween(t=>{for(const {node,from,to}of cards)node.position.z=THREE.MathUtils.lerp(from.z,to.z,t);});
}
