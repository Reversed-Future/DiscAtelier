import {THREE,applyPhotoMapping} from './surfaces.js';
import {makeParts} from '../crayon-spylent/parts.js';
import {materials} from './materials.js';
import {addBox} from './box.js';
import {addTray} from './silk-tray.js';
import {addCassette} from './cassette.js';
export {createSession} from './session.js';
export {setStudioLighting as configureViewer} from './lighting.js';
export const partLabels=[['box','开窗外盒'],['tray','丝绸海绵内托'],['cassette','未拆封磁带盒']];
export function buildAssembly({textures,data}){
 const root=new THREE.Group(),p=makeParts(root,textures),m=materials(textures);
 const parts=addBox(p,root,m,data.holePoints);Object.assign(parts,addTray(p,root,m));parts.cassette=addCassette(p,parts.tray,m);
 applyPhotoMapping(root,textures,data.boundaries);root.traverse(n=>n.name=n.userData.modelId??'');
 return {root,parts};
}
