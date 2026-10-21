import {createAssemblyView} from '../assembly-view.js';
import {THREE} from './surfaces.js';
import {makeMotion} from '../research-bai/motion.js';
import {dimensions as d,leafHeight} from './dimensions.js';
import {obiStored,obiTaken} from './obi.js';
import {bookTaken} from './case.js';

const identity=new THREE.Quaternion();
const rotation=y=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),y);
export function createSession({root,viewer,parts,onChange}){
 const {lid,book,obi,disc}=parts,m=makeMotion(viewer,root),nodes=new Map();
 root.traverse(n=>{if(n.userData.modelId)nodes.set(n.userData.modelId,n);});
 const s={busy:false,selected:'case',obiOut:false,obiFlat:false,obiFlipped:false,open:false,bookOut:false,page:0,discOut:false,discFlipped:false};
 const action=(id,label,disabled=false)=>({id,label,disabled});
 function notify(){
  let message=s.obiOut?(s.open?'盒盖已打开 · 右侧底图固定':'点击盒盖打开'):'点击腰封取下';
  let actions=[action('overview',view.held?'退出单件查看':'查看全套'),action('inspect','单件查看')];
  if(s.selected==='case')actions.push(action('case',s.open?'合上盒盖':'打开盒盖'),action('back','查看盒背'));
  if(s.selected==='obi'){message=s.obiOut?`腰封 · ${s.obiFlat?'已展开':'已合拢'}`:'腰封 · 套在盒上';actions.push(action('obi',s.obiOut?'放回腰封':'取下腰封'),action('obi-fold',s.obiFlat?'合拢腰封':'展开腰封',!s.obiOut),action('obi-flip','翻看另一面',!s.obiOut));}
  if(s.selected==='book'){
   message=s.bookOut?`歌词本 · ${s.page===0?'封面':s.page===d.leaves?'封底':`第 ${s.page*2-1}–${s.page*2} 页`}`:'歌词本从左侧抽出';
   actions.push(action('book',s.bookOut?'放回歌词本':'取出歌词本'),action('previous','上一页',!s.bookOut||s.page===0),action('next','下一页',!s.bookOut||s.page===d.leaves));
  }
  if(s.selected==='disc'){message=s.discOut?`光碟 · ${s.discFlipped?'银色背面':'印刷面'}`:'光碟 · 收纳在碟托内';actions.push(action('disc',s.discOut?'放回光碟':'取出光碟'),action('disc-flip','翻看另一面',!s.discOut));}
  onChange({...s,held:view.held?.userData.modelId??null,message,actions});
 }
 const view=createAssemblyView({root,viewer,motion:m}),showAll=()=>view.show();
 const all=()=>view.overview();
 async function focus(node,inspect=false){
  if(node===book&&s.bookOut){
   // Frame the entire spread once, including the sweep of a turning leaf.
   // This proxy is never rendered or added to the assembly's bounds.
   book.updateWorldMatrix(true,false);
   const geometry=new THREE.BoxGeometry(d.bookWidth*2,d.bookHeight,1.4);
   geometry.translate(-d.bookWidth/2,0,.7).applyMatrix4(book.matrixWorld);
   const frame=new THREE.Object3D();frame.geometry=geometry;
   try{await view.inspect(book,[frame]);}finally{geometry.dispose();}
  }else if(inspect)await view.inspect(node);else await view.frame([node]);
 }
 async function takeObi(){
  if(s.obiOut)return;m.follow([parts.shell]);
  // Slide both narrow flaps clear of the case before lifting or unfolding.
  await m.move(obi,[obiStored[0]-Math.max(d.obiFront,d.obiBack)-.5,0,obiStored[2]]);
  await m.move(obi,[obi.position.x,0,3]);
  await m.move(obi,obiTaken,rotation(Math.PI));s.obiOut=true;
  await m.angles([[nodes.get('obi-front'),'y',0],[nodes.get('obi-back'),'y',0]]);s.obiFlat=true;
 }
 async function openCase(){await takeObi();if(s.open)return;m.follow([parts.shell]);await m.angles([[lid,'y',-Math.PI]]);s.open=true;}
 async function takeBook(){
  await openCase();m.follow([book]);root.updateMatrixWorld(true);root.attach(book);
  // The book remains flat in the retaining channel until all paper clears it.
  const exit=book.position.clone();exit.x=bookTaken[0];await m.move(book,exit);
  await m.move(book,[exit.x,exit.y,3]);await m.move(book,[-6,15,1.4],identity);s.bookOut=true;
 }
 async function turn(forward){
  m.follow([]);
  if(forward?s.page===d.leaves:s.page===0)return;
  const i=forward?s.page:s.page-1,leaf=nodes.get('book-leaf-'+i),from=leaf.rotation.y,z=leaf.position.z;
  const end=forward?-Math.PI:0,targetZ=leafHeight(i,forward);
  await m.tween(t=>{
   leaf.rotation.y=THREE.MathUtils.lerp(from,end,t);leaf.position.z=THREE.MathUtils.lerp(z,targetZ,t);
   leaf.traverse(n=>{if(n.morphTargetInfluences)n.morphTargetInfluences[0]=Math.sin(Math.PI*t)*.6;});
  });s.page+=forward?1:-1;
 }
 async function putBook(){
  if(!s.bookOut)return;await view.frame([book]);while(s.page>0)await turn(false);await openCase();m.follow([book]);
  const h=m.home.get(book);root.updateMatrixWorld(true);
  const target=root.worldToLocal(h.parent.localToWorld(h.position.clone()));
  await m.move(book,[book.position.x,book.position.y,3]);
  await m.move(book,[bookTaken[0],target.y,3],rotation(-Math.PI));
  await m.move(book,[bookTaken[0],target.y,target.z]);await m.move(book,target);
  h.parent.attach(book);book.position.copy(h.position);book.quaternion.copy(h.quaternion);s.bookOut=false;
 }
 async function takeDisc(){await openCase();m.follow([disc]);await m.out(disc,[14,0,1.2]);s.discOut=true;s.discFlipped=false;}
 async function putDisc(){if(!s.discOut)return;await openCase();await view.frame([disc]);m.follow([disc]);await m.put(disc);s.discOut=false;s.discFlipped=false;}
 async function putObi(){
  if(!s.obiOut)return;await view.frame([parts.shell]);m.follow([parts.shell]);
  if(s.open){await m.angles([[lid,'y',0]]);s.open=false;}
  await m.angles([[nodes.get('obi-front'),'y',Math.PI/2],[nodes.get('obi-back'),'y',-Math.PI/2]]);
  await m.move(obi,[obiStored[0]-Math.max(d.obiFront,d.obiBack)-.5,0,3],rotation(Math.PI/2));
  await m.move(obi,[obi.position.x,0,obiStored[2]]);await m.move(obi,obiStored);
  s.obiOut=false;s.obiFlat=false;s.obiFlipped=false;
 }
 async function run(fn,reveal=true){if(s.busy)return;s.busy=true;m.follow([]);viewer.controls.enabled=false;notify();try{if(reveal){await view.exit();showAll();}await fn();}finally{m.follow([]);s.busy=false;viewer.controls.enabled=true;notify();}}
 async function act(id){return run(async()=>{
  if(id==='overview'){await all();return;}
  if(id==='inspect'){await focus(parts[s.selected==='case'?'shell':s.selected],true);return;}
  if(id==='case'){s.selected='case';if(s.open){await m.angles([[lid,'y',0]]);s.open=false;}else await openCase();await focus(parts.shell);}
  if(id==='back'){s.selected='case';await focus(parts.shell);const view=viewer.snapshot();view.position.sub(view.target).negate().add(view.target);await m.cameraTo(view);}
  if(id==='obi'){s.selected='obi';if(s.obiOut){await putObi();await focus(parts.shell);}else{await takeObi();await focus(parts.shell);}}
  if(id==='obi-fold'&&s.obiOut){s.selected='obi';await m.angles([[nodes.get('obi-front'),'y',s.obiFlat?Math.PI/2:0],[nodes.get('obi-back'),'y',s.obiFlat?-Math.PI/2:0]]);s.obiFlat=!s.obiFlat;await focus(obi);}
  if(id==='obi-flip'&&s.obiOut){s.obiFlipped=!s.obiFlipped;await m.move(obi,obi.position.clone(),rotation(s.obiFlipped?0:Math.PI));}
  if(id==='book'){s.selected='book';if(s.bookOut){await putBook();await focus(parts.shell);}else{await takeBook();await focus(book);}}
  if(id==='previous'||id==='next'){
   s.selected='book';
   if(!s.bookOut){showAll();await takeBook();await focus(book);}
   await turn(id==='next');
  }
  if(id==='disc'){s.selected='disc';if(s.discOut){await putDisc();await focus(parts.shell);}else{await takeDisc();await focus(disc);}}
  if(id==='disc-flip'&&s.discOut){s.selected='disc';s.discFlipped=!s.discFlipped;await m.move(disc,disc.position.clone(),rotation(s.discFlipped?Math.PI:0));}
 },id!=='overview'&&id!=='inspect'&&id!=='disc-flip'&&id!=='obi-flip'&&id!=='previous'&&id!=='next');}
 async function pick(id){
  if(s.busy)return;
  if(id===null)return act('overview');
  const node=nodes.get(id);let target=node;
  while(target&&!['book','obi','disc','case'].includes(target.userData.modelId))target=target.parent;
  const part=target?.userData.modelId;
  if(part==='book'){
   if(!s.bookOut)return act('book');
   let leaf=node;while(leaf&&leaf.parent!==book)leaf=leaf.parent;
   const i=leaf?Array.from({length:d.leaves},(_,i)=>nodes.get('book-leaf-'+i)).indexOf(leaf):-1;
   return act(i>=0&&i<s.page?'previous':'next');
  }
  if(part==='disc'){if(s.discOut&&view.held!==disc)return select('disc');return act(s.discOut?'disc-flip':'disc');}
  if(part==='obi')return act(s.obiOut?'obi-fold':'obi');
  if(part==='case')return act('case');
 }
 async function select(id){return run(async()=>{s.selected=id;await focus(parts[id==='case'?'shell':id],true);});}
 async function reset(){return run(async()=>{await putBook();await putDisc();await putObi();s.selected='case';await focus(parts.shell);});}
 viewer.fit([root],{front:true});notify();return {act,pick,select,reset,state:s,nodes,motion:m};
}
