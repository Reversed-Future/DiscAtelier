import {THREE,applyPhotoMapping} from './surfaces.js';
import {makeParts} from '../crayon-spylent/parts.js';
import {addCase,bookStored,hingeX,hingeZ} from './case.js';
import {addBook} from './book.js';
import {addDisc} from './disc.js';
import {addObi} from './obi.js';
import {addGifts,giftIds,giftLabels} from './gifts.js';
export {createSession} from './session.js';
export const partLabels=[['case','透明碟盒'],['obi','腰封'],['book','歌词本'],['disc','光碟'],...giftIds.map(id=>[id,giftLabels[id]])];
export function buildAssembly({textures,data}){
 const root=new THREE.Group(),p=makeParts(root,textures);
 const parts=addCase(root,p);Object.assign(parts,addDisc(parts.shell,p),addGifts(root,p));parts.obi=addObi(root,p);parts.book=addBook(parts.lid,p);
 parts.book.position.set(bookStored[0]-hingeX,0,bookStored[2]-hingeZ);
 applyPhotoMapping(root,textures,data.boundaries);root.traverse(n=>n.name=n.userData.modelId??'');
 return {root,parts};
}
