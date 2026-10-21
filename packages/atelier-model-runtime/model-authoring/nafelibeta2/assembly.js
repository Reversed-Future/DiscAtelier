import {THREE} from './surfaces.js';
import {makeParts} from '../crayon-spylent/parts.js';
import {addCase} from './case.js';
import {addBook} from './book.js';
import {addContents} from './contents.js';
import {names} from './session.js';
export {createSession} from './session.js';
export const partLabels=['band','case','book','bag','insert','disc','yellow','polaroid-1','polaroid-2','poster'].map(id=>[id,names[id]]);
export function buildAssembly({textures}){
 const root=new THREE.Group(),p=makeParts(root,textures),parts={...addCase(root,p),...addBook(root,p),...addContents(root,p)};
 root.traverse(n=>n.name=n.userData.modelId??'');return {root,parts};
}
