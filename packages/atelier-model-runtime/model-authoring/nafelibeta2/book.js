import {THREE,clearMaterial} from './surfaces.js';
import {d,leaves,bookDepth} from './dimensions.js';
import {addBookInk} from './book-ink.js';
import {rectifyPaperFaces} from './paper-boundaries.js';
export function addBook(root,p){
 const book=p.group('book',root);book.position.set(0,0,.55);let z=bookDepth;const pages=[];
 const glass=clearMaterial();glass.opacity=.38;glass.thickness=.018;glass.roughness=.11;
 for(const [i,entry] of leaves.entries()){
  z-=entry.thickness;const node=p.group('leaf-'+i,book);node.position.set(-d.bookWidth/2,0,z+entry.thickness/2);
  node.userData.closedZ=node.position.z;node.userData.leaf=i;
  if(entry.transparent){
   const panel=p.box(node,'leaf-clear-'+i,[d.bookWidth,d.bookHeight,entry.thickness],[d.bookWidth/2,0,0],glass);panel.castShadow=false;
   addBookInk(p,node,i,entry.id);
  }else{
   p.plate(node,'leaf-paper-'+i,d.bookWidth,d.bookHeight,entry.thickness,entry.front,entry.back,{position:[d.bookWidth/2,0,0]});
   rectifyPaperFaces(node,i,entry);
  }
  pages.push(node);
 }
 const metal=new THREE.MeshStandardMaterial({color:'#aeb5b7',metalness:.9,roughness:.2});
 for(const y of [-3.2,3.2]){
  const ring=new THREE.TorusGeometry(.22,.022,8,32);ring.rotateX(Math.PI/2);
  p.mesh(book,'binding-'+y,ring,metal,[-d.bookWidth/2-.05,y,bookDepth/2]);
 }
 return {book,pages};
}
