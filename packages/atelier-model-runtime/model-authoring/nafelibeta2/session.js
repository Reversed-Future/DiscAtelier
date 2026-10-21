import {THREE} from './surfaces.js';
import {makeMotion} from '../research-bai/motion.js';
import {d,leaves,bookDepth} from './dimensions.js';
import {readingFrame} from '../../src/discs/interactive/model/reading-frame.js';
import {foldPoster} from './poster.js';
export const names={band:'橙色橡皮带',case:'透明碟盒',lid:'碟盒外盖',insert:'透明字卡',disc:'光碟',book:'歌词本',bag:'自封袋',zip:'袋口',yellow:'黄色长条','polaroid-1':'拍立得 1','polaroid-2':'拍立得 2',poster:'海报'};
const accessories=['yellow','polaroid-1','polaroid-2','poster'];
const positions={band:[-18,9,1.1],case:[8,0,1.1],book:[-18,0,1.3],bag:[-19,-15,1],insert:[22,0,1.5],disc:[-19,-29,1.5],yellow:[-5,-9,1.4],'polaroid-1':[-6.7,-17.5,1.3],'polaroid-2':[2,-17.5,1.3],poster:[13,-14.2,1.3]};
const posterOpenPosition=[13,-37,1.3];
export function createSession({root,viewer,parts,onChange}){
 const motion=makeMotion(viewer,root),nodes=new Map();root.traverse(n=>{if(n.userData.item)nodes.set(n.userData.item,n);});
 const state={out:new Set(),open:new Set(),selected:'band',held:null,busy:false,page:0,posterOpen:false};let overview=null,message='点击橙色带开始，或选择一个部件';
 const originallyVisible=new Map();root.traverse(n=>originallyVisible.set(n,n.visible));
 const filmPositions=[];for(const group of [parts.bagFront,parts.bagBack])group.traverse(n=>{if(n.geometry){filmPositions.push({node:n,base:n.geometry.attributes.position.array.slice(),sign:group===parts.bagFront?1:-1});}});
 for(const name of ['bag-seam--7.35','bag-seam-7.35']){const node=parts.bag.getObjectByName(name);filmPositions.push({node,base:node.geometry.attributes.position.array.slice(),sign:0});}
 const tracks=parts.zip.children.map(node=>({node,z:node.position.z}));
 const emit=(text=message)=>{message=text;onChange({...state,message,actions:actions()});};
 const normalize=id=>id?.startsWith('leaf-')?'book':id==='bag-front'||id==='bag-back'?'bag':id;
 const restPosition=id=>!state.out.has('bag')&&id==='case'?[28,0,1.1]:!state.out.has('bag')&&id==='insert'?[48,0,1.5]:positions[id];
 async function arrangeCase(compact){
  for(const id of ['case','insert'])if(state.out.has(id))await motion.move(nodes.get(id),compact?positions[id]:id==='case'?[28,0,1.1]:[48,0,1.5]);
 }
 function showOnly(id){
  const keep=new Set();if(id){let n=nodes.get(id);n.traverse(c=>keep.add(c));while(n){keep.add(n);n=n.parent;}}
  for(const [n,v]of originallyVisible)n.visible=v&&(!id||keep.has(n));
 }
 async function exit(){if(!state.held)return;state.held=null;showOnly();const saved=overview;overview=null;if(saved)await motion.cameraTo(saved);}
 async function framePart(id,options){
  if(id!=='book')return motion.focus([nodes.get(id)],options);
  const frame=readingFrame(parts.book,new THREE.Box3(new THREE.Vector3(-1.5*d.bookWidth,-d.bookHeight/2,0),new THREE.Vector3(d.bookWidth/2,d.bookHeight/2,bookDepth+.24)));
  try{await motion.focus([frame],options);}finally{frame.geometry.dispose();}
 }
 async function focus(id){await framePart(id,{preserve:true});}
 async function inspect(id){if(!state.held)overview=viewer.snapshot();state.held=id;showOnly(id);await framePart(id,{front:true,preserve:false,zoom:.91});}
 async function orientHome(id){const n=nodes.get(id),home=motion.home.get(n);root.updateMatrixWorld(true);const q=home.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(home.quaternion).premultiply(root.getWorldQuaternion(new THREE.Quaternion()).invert());return q;}
 async function take(id){
  await exit();if(state.out.has(id)){await inspect(id);return;}
  if(id!=='band'&&!state.out.has('band'))await take('band');
  if(id==='book'&&!state.out.has('case'))await take('case');
  if(id==='bag'){if(!state.out.has('case'))await take('case');if(!state.out.has('book'))await take('book');}
  if(['disc','insert'].includes(id)){if(!state.out.has('case'))await take('case');if(!state.open.has('lid'))await toggleLid(true);}
  if(accessories.includes(id)){if(!state.out.has('bag'))await take('bag');if(!state.open.has('zip'))await toggleBag(true);}
  const n=nodes.get(id);motion.follow([nodes.get(id==='band'?'case':id)]);
  if(id==='band'){
   await motion.tween(t=>n.scale.x=1+.04*t);await motion.move(n,[0,-9,1.12]);await motion.move(n,[-18,-9,1.12]);await motion.move(n,positions.band);await motion.tween(t=>n.scale.x=1.04-.04*t);
  }else if(id==='insert'){
   await motion.move(n,[20,0,.23]);root.attach(n);await motion.out(n,restPosition(id));
  }else if(accessories.includes(id)){
   await motion.move(n,[n.position.x,21,n.position.z]);root.attach(n);
   const q=new THREE.Quaternion();
   const high=n.position.clone();high.z+=3;await motion.move(n,high);await motion.move(n,positions[id],q);
  }else if(id==='disc'){
   await motion.move(n,[.45,0,2.2]);
   if(parts.shell.rotation.y%(2*Math.PI)>Math.PI/2)await motion.move(n,[18,0,2.2]);
   root.attach(n);const high=n.position.clone();high.z=Math.max(high.z,parts.shell.position.z+8);await motion.move(n,high);await motion.move(n,[positions[id][0],positions[id][1],high.z],new THREE.Quaternion());await motion.move(n,positions[id]);
  }else await motion.out(n,restPosition(id));
  state.out.add(id);state.selected=id;
  if(id==='bag')await arrangeCase(true);
  await focus(id==='band'?'case':id,id==='book'||accessories.includes(id));emit(`${names[id]}已取出`);
 }
 async function toggleLid(opening=!state.open.has('lid')){
  await exit();if(!state.out.has('case'))await take('case');
  motion.follow([parts.shell]);await motion.angles([[parts.lid,'y',opening?-Math.PI:0]]);opening?state.open.add('lid'):state.open.delete('lid');state.selected='case';await focus('case');
 }
 async function toggleBag(opening=!state.open.has('zip')){
  await exit();if(!state.out.has('bag'))await take('bag');
  motion.follow([parts.bag]);
  const from=state.open.has('zip')?1:0,to=opening?1:0;
  await motion.tween(t=>{const v=THREE.MathUtils.lerp(from,to,t);for(const {node,base,sign}of filmPositions){const a=node.geometry.attributes.position;for(let i=0;i<a.count;i++){const y=base[i*3+1]+node.position.y,w=Math.max(0,Math.min(1,(y+7.25)/14.5));a.setZ(i,base[i*3+2]+(sign||Math.sign(base[i*3+2]))*.8*w**3*v);}a.needsUpdate=true;node.geometry.computeVertexNormals();}for(const {node,z}of tracks)node.position.z=z+(node.userData.modelId==='zip-track-0.21'?1:-1)*.8*((6.3+7.25)/14.5)**3*v;});
  opening?state.open.add('zip'):state.open.delete('zip');state.selected='bag';await focus('bag');
  parts.bagFront.userData.pickThrough=opening;parts.bagBack.userData.pickThrough=opening;
 }
 async function turnPage(delta){
  motion.follow([]);
  if(!state.out.has('book'))await take('book');
  const target=THREE.MathUtils.clamp(state.page+delta,0,leaves.length);if(target===state.page)return;
  const i=delta>0?state.page:state.page-1,node=parts.pages[i],start=node.rotation.y,end=delta>0?-Math.PI:0;
  const offset=node.userData.closedZ-bookDepth/2;
  await motion.tween(t=>{const angle=THREE.MathUtils.lerp(start,end,t);node.rotation.y=angle;node.position.x=-5.9+offset*Math.sin(angle);node.position.z=bookDepth/2+offset*Math.cos(angle)+.12*Math.sin(Math.PI*t);});
  state.page=target;state.selected='book';
  const entry=leaves[i];emit(entry.transparent?`透明插页 ${entry.id}${delta>0?'已翻到左侧':'已覆回右侧'}`:`歌词本 · 已翻 ${target} / ${leaves.length} 张`);
 }
 async function closeBook(){
  if(!state.page)return;
  // Close the entire left stack together, independent of browsing history.
  const poses=parts.pages.slice(0,state.page).map(n=>({n,y:n.rotation.y,offset:n.userData.closedZ-bookDepth/2}));
  await motion.tween(t=>poses.forEach(({n,y,offset})=>{const angle=y*(1-t);n.rotation.y=angle;n.position.x=-5.9+offset*Math.sin(angle);n.position.z=bookDepth/2+offset*Math.cos(angle);}));state.page=0;
 }
 async function posterFold(opening=!state.posterOpen){
  await exit();
  if(!state.out.has('poster'))await take('poster');
  motion.follow([parts.poster]);if(opening)await motion.move(parts.poster,posterOpenPosition,new THREE.Quaternion());
  await foldPoster(parts,motion,opening);
  if(!opening)await motion.move(parts.poster,positions.poster,new THREE.Quaternion());
  state.posterOpen=opening;state.selected='poster';await focus('poster',true);
 }
 async function put(id){
  if(!state.out.has(id))return;await exit();await focus(id);motion.follow([nodes.get(id)]);
  if(['case','book','bag'].includes(id)){
   if(id==='case'){if(state.open.has('lid'))await toggleLid(false);if(state.out.has('book')||state.out.has('bag')){emit('先将自封袋和歌词本放回，再叠上碟盒');return;}}
   if(id==='book'){if(state.out.has('bag')){emit('先将自封袋放回');return;}await closeBook();}
   if(id==='bag'&&state.open.has('zip'))await toggleBag(false);
   if(id==='bag')await arrangeCase(false);
  }
  if(id==='poster'&&state.posterOpen)await posterFold(false);
  if(id==='band'){
   if(['case','book','bag'].some(v=>state.out.has(v))){emit('先将三件包装叠回原位');return;}
   const n=parts.band;await motion.tween(t=>n.scale.x=1+.04*t);await motion.move(n,[-18,-9,1.12],new THREE.Quaternion());await motion.move(n,[0,-9,1.12]);await motion.move(n,[0,0,1.12]);await motion.tween(t=>n.scale.x=1.04-.04*t);
  }else if(['insert','disc',...accessories].includes(id)){
   if(['insert','disc'].includes(id)&&!state.open.has('lid'))await toggleLid(true);
   if(accessories.includes(id)&&!state.open.has('zip'))await toggleBag(true);
   motion.follow([nodes.get(id)]);const n=nodes.get(id),h=motion.home.get(n),q=await orientHome(id);
   const local=h.position.clone();if(id==='insert')local.x=20;else if(id==='disc')local.z=2.2;else local.y=21;
   root.updateMatrixWorld(true);const target=root.worldToLocal(h.parent.localToWorld(local.clone()));
   const invertedDisc=id==='disc'&&parts.shell.rotation.y%(2*Math.PI)>Math.PI/2;
   const approach=invertedDisc?root.worldToLocal(h.parent.localToWorld(new THREE.Vector3(18,0,2.2))):target;
   root.attach(n);const high=n.position.clone();high.z=Math.max(n.position.z,target.z)+(id==='disc'?8:4);await motion.move(n,high);const over=approach.clone();over.z=high.z;await motion.move(n,over,q);await motion.move(n,approach,q);if(invertedDisc)await motion.move(n,target,q);
   h.parent.attach(n);await motion.move(n,h.position,h.quaternion);
  }else await motion.put(nodes.get(id));
  state.out.delete(id);state.selected=accessories.includes(id)?'bag':['insert','disc'].includes(id)?'case':id;await focus(state.selected);emit(`${names[id]}已放回`);
 }
 function actions(){
  const id=normalize(state.selected),a=[];const add=(key,label,disabled=false)=>a.push({id:key,label,disabled});
  if(!state.out.has('band'))add('take-band','取下橡皮带');
  if(names[id]&&!['lid','zip','band'].includes(id)&&!state.out.has(id))add('take-'+id,'取出'+names[id]);
  if(state.out.has(id)){add('inspect','单件查看');add('flip','翻面');add('put','放回');}
  if(id==='case'||id==='lid'){add('lid',state.open.has('lid')?'合上外盖':'打开外盖');if(state.open.has('lid'))for(const v of ['insert','disc'])if(!state.out.has(v))add('take-'+v,'取出'+names[v]);}
  if(id==='book'&&state.out.has('book')){add('previous','上一页',!state.page);add('next','下一页',state.page===leaves.length);if(state.page)add('close-book','合上歌词本');}
  if(id==='bag'||id==='zip'){add('zip',state.open.has('zip')?'合上袋口':'打开袋口');if(state.open.has('zip'))for(const v of accessories)if(!state.out.has(v))add('take-'+v,'取出'+names[v]);}
  if(id==='poster'&&state.out.has('poster'))add('poster',state.posterOpen?'折起海报':'展开海报');
  if(state.held)add('exit','退出查看');return a;
 }
 async function run(fn){if(state.busy)return;state.busy=true;motion.follow([]);viewer.controls.enabled=false;emit();try{await fn();}finally{motion.follow([]);state.busy=false;viewer.controls.enabled=true;emit();}}
 async function pick(raw){return run(async()=>{
  if(!raw){await exit();return;}let id=normalize(raw);if(!names[id])return;
  if((raw==='lid'||raw==='disc'||raw==='insert')&&!state.out.has('case')&&!state.out.has(raw))id='case';
  state.selected=id;
  if(id==='lid')await toggleLid();else if(id==='zip')await toggleBag();
  else if(id==='book'&&state.out.has('book'))await turnPage(nodes.get(raw)?.userData.leaf<state.page?-1:1);
  else if(id==='case'&&state.out.has(id)&&!state.held)await toggleLid();
  else if(id==='bag'&&state.out.has(id)&&!state.held)await toggleBag();
  else if(id==='poster')await posterFold();
  else if(!state.out.has(id))await take(id);else await inspect(id);
 });}
 async function act(id){return run(async()=>{
  if(id.startsWith('take-'))return take(id.slice(5));
  if(id==='inspect')return inspect(normalize(state.selected));if(id==='put')return put(normalize(state.selected));
  if(id==='exit')return exit();if(id==='lid')return toggleLid();if(id==='zip')return toggleBag();if(id==='poster')return posterFold();
  if(id==='next'||id==='previous')return turnPage(id==='next'?1:-1);
  if(id==='close-book'){await closeBook();return;}
  if(id==='flip'){const n=nodes.get(normalize(state.selected));await motion.angles([[n,'y',n.rotation.y+Math.PI]]);}
 });}
 async function reset(){return run(async()=>{
  await exit();for(const id of ['poster','polaroid-2','polaroid-1','yellow','insert','disc','bag','book','case','band'])if(state.out.has(id))await put(id);
  state.selected='band';await focus('case');emit('全部已收起');
 });}
 const select=id=>{if(state.busy)return;state.selected=id;emit();};
 viewer.fit([root],{front:true});emit();return{state,nodes,motion,pick,act,reset,select,exit};
}
