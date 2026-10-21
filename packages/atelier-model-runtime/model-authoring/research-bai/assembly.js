import {THREE,materials} from './geometry.js';
import {makeParts} from '../crayon-spylent/parts.js';
import {addCase} from './case.js';
import {addFolder} from './folder.js';
import {addContents} from './contents.js';
import {names} from './session.js';
export {createSession} from './session.js';
export const partLabels=Object.entries(names);
export function buildAssembly({textures,data}){
 const root=new THREE.Group(),p=makeParts(root,textures),m=materials();
 const parts={...addCase(root,p,m),...addFolder(root,p,m),...addContents(root,p,m,data.holes)};
 root.traverse(n=>n.name=n.userData.modelId??'');
 return {root,parts,decodeText:data.decodeText,calibration:data.calibration};
}
