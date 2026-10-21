import {THREE} from './surfaces.js';
import {dimensions as d} from './dimensions.js';
import {addKeychain} from './keychain.js';

export const giftIds=['postcard-1','postcard-2','keychain'];
export const giftLabels={'postcard-1':'明信片一','postcard-2':'签名明信片','keychain':'亚克力钥匙扣'};
export function addGifts(parent,p){
 const gifts={};
 const paper=new THREE.MeshPhysicalMaterial({color:'#e3e0d8',roughness:1,specularIntensity:.06,envMapIntensity:.05});
 for(const [i,id]of ['postcard-1','postcard-2'].entries()){
  const card=p.group(id,parent);card.position.set(12,-14-i*11,.08);
  p.plate(card,id+'-paper',d.postcardWidth,d.postcardHeight,d.postcardThickness,id+'-front',i===0?null:id+'-back',{edge:paper});
  card.traverse(n=>{if(n.material?.map)n.material=new THREE.MeshPhysicalMaterial({map:n.material.map,color:new THREE.Color().setRGB(.7,.7,.7),roughness:1,metalness:0,specularIntensity:.06,envMapIntensity:.05});});
  gifts[id]=card;
 }
 gifts.keychain=addKeychain(parent,p);return gifts;
}
