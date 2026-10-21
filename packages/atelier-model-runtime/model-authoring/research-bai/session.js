import {THREE} from './geometry.js';
import {cardIds} from './folder.js';
import {makeMotion} from './motion.js';
import {envelopeFoldAngles} from './envelope.js';
import {makeDiscTransfer} from './disc-transfer.js';
import {spreadCardStack} from './card-spread.js';
export const names={case:'外盒','case-top':'上片','case-bottom':'下片','case-left':'左插片','case-right':'右插片',band:'橡皮带',folder:'档案袋','folder-cover':'档案袋封面','folder-tongue':'右侧插舌','folder-retainer':'下方围挡',list:'LIST',label:'白标签',clip:'回形针',envelope:'碟片信封','envelope-flap':'信封封口',disc:'光盘',poster:'海报',decoder:'解密卡',...Object.fromEntries(cardIds.map((id,i)=>[id,`歌词卡 ${String(i+1).padStart(2,'0')}`]))};
export function createSession({viewer,root,parts,onChange,decodeText,calibration}){
 const motion=makeMotion(viewer,root),nodes=new Map();root.traverse(n=>{if(n.userData.item)nodes.set(n.userData.item,n);});
 const originalVisibility=new Map();root.traverse(n=>originalVisibility.set(n,n.visible));
 function showOnly(ids=[]){const keep=new Set();for(const id of ids){let n=nodes.get(id);n.traverse(v=>keep.add(v));while(n){keep.add(n);n=n.parent;}}for(const [n,visible]of originalVisibility)n.visible=visible&&(!ids.length||keep.has(n));}
 const state={out:new Set(),open:new Set(),selected:'band',held:null,busy:false,posterStep:0,decoded:null};let overview=null;
 const layerIds=['folder','envelope','poster','decoder'];
 const positions={band:[-26,20,1.5],folder:[36,0,2],envelope:[-30,-28,1.3],disc:[-14,-28,1.4],poster:[0,-60,1],decoder:[32,-29,1.5],list:[29,27,1.1],label:[19,27,1.2],clip:[39,27,1.3],...Object.fromEntries(cardIds.map((id,i)=>[id,[56+(i%5)*15.7,24-Math.floor(i/5)*21,1.3]]))};
 const discTransfer=makeDiscTransfer({root,parts,motion,position:positions.disc});
 let message='';const emit=(next=message)=>{message=next;onChange({...state,message,actions:actions()});};
 const caseOpen=()=>['top','bottom','left','right'].every(id=>state.open.has('case-'+id));
 const folderOpen=()=>state.out.has('folder')&&state.open.has('folder-cover');
 const released=()=>folderOpen()&&state.open.has('folder-tongue')&&state.open.has('folder-retainer');
 function reasonTake(id){
  if(id==='band')return '';
  if(layerIds.includes(id)){if(!caseOpen())return '先打开外盒的上片、下片和左右插片';const above=layerIds.slice(0,layerIds.indexOf(id)).find(v=>!state.out.has(v));return above?`先取出上面的${names[above]}`:'';}
  if(['clip','list','label'].includes(id)){if(!state.out.has('folder'))return '先取出档案袋';if(id!=='clip'&&!state.out.has('clip'))return '先取下回形针';if(id==='list'&&!state.out.has('label'))return '先取下盖在 LIST 上的白标签';return '';}
  if(cardIds.includes(id)){if(!released())return '先打开档案袋封面、右侧插舌和下方围挡';const above=cardIds.slice(0,cardIds.indexOf(id)).find(v=>!state.out.has(v));return above?`先取出上面的${names[above]}`:'';}
  if(id==='disc')return !state.out.has('envelope')?'先取出信封':!state.open.has('envelope-flap')?'先打开信封背面的封口':'';
  return '请先打开外层部件';
 }
 function reasonPut(id){
  if(id==='band')return ['top','bottom','left','right'].some(k=>state.open.has('case-'+k))?'先合上外盒':'';
  if(layerIds.includes(id)){if(!caseOpen())return '先展开外盒再放回';const above=layerIds.slice(0,layerIds.indexOf(id)).find(v=>!state.out.has(v));return above?`先移开上面的${names[above]}`:'';}
  if(cardIds.includes(id))return released()?'':'先展开档案袋的封面、插舌和围挡';
  if(['clip','label','list'].includes(id))return !state.out.has('folder')?'先取出档案袋':state.open.has('folder-cover')?'先合上档案袋封面':id==='clip'&&(state.out.has('label')||state.out.has('list'))?'先放回白标签和 LIST':'';
  if(id==='disc')return state.out.has('envelope')&&state.open.has('envelope-flap')?'':'先取出信封并打开封口';
  return '';
 }
 async function exitView(){if(!state.held)return;state.held=null;showOnly();const saved=overview;overview=null;if(saved)await motion.cameraTo(saved);}
 async function follow(id){await motion.focus([nodes.get(id)],{preserve:true});}
 async function inspect(id){if(!state.held)overview=viewer.snapshot();state.held=id;const ids=id==='decoder'&&state.decoded?[id,state.decoded]:[id];showOnly(ids);await motion.focus(ids.map(v=>nodes.get(v)),{front:true,preserve:false,zoom:.86});}
 async function take(id){
  const why=reasonTake(id);if(why){emit(why);return;}await exitView();const n=nodes.get(id);motion.follow([nodes.get(id==='band'?'case':id==='clip'?'folder':id)]);
  if(id==='band'){
   await motion.tween(t=>n.scale.x=1+.025*t);await motion.move(n,[0,-10.5,1.31]);await motion.move(n,[-26,-10.5,1.5]);await motion.move(n,positions.band);await motion.tween(t=>n.scale.x=1.025-.025*t);
  }else if(id==='disc')await discTransfer.take();
  else await motion.out(n,positions[id]);
  state.out.add(id);state.selected=id;await follow(id==='band'?'case':id==='clip'?'folder':id);if(id==='band')state.selected='case-top';
 }
 const folderAngles=(id,opening)=>{const isTongue=id==='folder-tongue',axis=isTongue?'y':'x',angle=opening?0:-Math.PI/2;return [[isTongue?parts.tongueWall:parts.retainerWall,axis,angle],[isTongue?parts.tongue:parts.retainer,axis,angle]];};
 async function spreadCards(){
  if(!folderOpen()){emit('先取出档案袋并打开封面');return;}
  const ids=cardIds.filter(id=>!state.out.has(id));if(!ids.length)return;
  await exitView();
  for(const id of ['folder-tongue','folder-retainer'])if(!state.open.has(id)){await motion.angles(folderAngles(id,true));state.open.add(id);}
  await spreadCardStack({ids,nodes,positions,root,motion,viewer});
  for(const id of ids)state.out.add(id);state.selected=ids[0];emit('歌词卡已全部摊开，点击任意一张查看');
 }
 async function closeFolder(){
  if(state.open.has('folder-retainer')){await motion.angles(folderAngles('folder-retainer',false));state.open.delete('folder-retainer');}
  if(state.open.has('folder-tongue')){await motion.angles(folderAngles('folder-tongue',false));state.open.delete('folder-tongue');}
  if(state.open.has('folder-cover')){await motion.angles([[parts.cover,'y',0]]);state.open.delete('folder-cover');}
 }
 async function foldPoster(){
  if(state.posterStep>=3)await motion.angles(parts.rows.map(({pivot,sign})=>[pivot,'x',sign*Math.PI]));
  if(state.posterStep>=2)await motion.angles([[parts.columns[2],'y',-Math.PI]]);
  if(state.posterStep>=1)await motion.angles([[parts.columns[0],'y',Math.PI]]);state.posterStep=0;
 }
 async function clearDecode(){if(!state.decoded)return;const card=state.decoded;state.decoded=null;const lifted=parts.decoder.position.clone();lifted.z=5;await motion.move(parts.decoder,lifted);await motion.move(parts.decoder,[positions.decoder[0],positions.decoder[1],5],new THREE.Quaternion());await motion.move(parts.decoder,positions.decoder);if(state.held==='decoder'){state.held=card;state.selected=card;showOnly([card]);}}
 async function put(id,{force=false}={}){
  if(!state.out.has(id))return;const why=force?'':reasonPut(id);if(why){emit(why);return;}
  await exitView();if(state.decoded)await clearDecode();await follow(id);motion.follow([nodes.get(id)]);
  if(id==='folder')await closeFolder();
  if(id==='poster')await foldPoster();
  if(id==='envelope'&&state.open.has('envelope-flap')){await motion.angles(envelopeFoldAngles(parts,false));state.open.delete('envelope-flap');}
  if(id==='band'){
   const n=parts.band;await motion.move(n,[-26,-10.5,1.5]);await motion.tween(t=>n.scale.x=1+.025*t);await motion.move(n,[0,-10.5,1.31]);await motion.move(n,[0,-3.1,1.31]);await motion.tween(t=>n.scale.x=1.025-.025*t);
  }else if(id==='disc')await discTransfer.put();
  else await motion.put(nodes.get(id),{approach:cardIds.includes(id)?[0,20,0]:null});state.out.delete(id);state.selected=id;
  if(!force)await follow(id==='band'?'case':layerIds.includes(id)?'case':cardIds.includes(id)?'folder':id==='disc'?'envelope':'folder');
 }
 async function toggle(id){
  await exitView();motion.follow([nodes.get(id.startsWith('case-')?'case':id.startsWith('folder-')?'folder':'envelope')]);
  const opening=!state.open.has(id);
  if(id.startsWith('case-')){
   const key=id.slice(5),f=parts.flaps[key];if(!f)return;
   if(opening){if(!state.out.has('band')){emit('先取下橡皮带');return;}if(key!=='top'&&!state.open.has('case-top')){emit('先打开上片');return;}if(['left','right'].includes(key)&&!state.open.has('case-bottom')){emit('先打开下片');return;}}
   else {if(key==='top'&&['bottom','left','right'].some(k=>state.open.has('case-'+k))){emit('先合上左右插片和下片');return;}if(key==='bottom'&&['left','right'].some(k=>state.open.has('case-'+k))){emit('先合上左右插片');return;}}
   if(opening){await motion.angles([[f.face,'x',0]]);await motion.angles([[f.wall,'x',0]]);}else{await motion.angles([[f.wall,'x',Math.PI/2]]);await motion.angles([[f.face,'x',Math.PI/2]]);}
   opening?state.open.add(id):state.open.delete(id);await motion.focus([parts.bottom,f.anchor],{preserve:true});return;
  }
  if(id==='folder-cover'){
   if(!state.out.has('folder')){emit('先取出档案袋');return;}
   if(opening){await motion.angles([[parts.cover,'y',-Math.PI]]);state.open.add(id);}else await closeFolder();await follow('folder');return;
  }
  if(id==='folder-tongue'||id==='folder-retainer'){
   if(!folderOpen()){emit('先打开档案袋封面');return;}
   if(id==='folder-retainer'&&opening&&!state.open.has('folder-tongue')){emit('先解开右侧插舌');return;}
   if(id==='folder-tongue'&&!opening&&state.open.has('folder-retainer')){emit('先合上下方围挡');return;}
   await motion.angles(folderAngles(id,opening));
  }else if(id==='envelope-flap'){
   if(!state.out.has('envelope')){emit('先取出信封');return;}await motion.angles(envelopeFoldAngles(parts,opening));
  }else return;
  opening?state.open.add(id):state.open.delete(id);await follow(id.startsWith('folder')?'folder':'envelope');
 }
 async function unfold(){
  if(!state.out.has('poster'))return;await exitView();motion.follow([parts.poster]);
  if(state.posterStep===4){await foldPoster();}else{
   const step=state.posterStep;
   if(step<2)await motion.angles([[parts.columns[step===0?0:2],'y',0]]);
   else await motion.angles(parts.rows.filter(({sign})=>sign===(step===2?1:-1)).map(({pivot})=>[pivot,'x',0]));
   state.posterStep++;
  }await follow('poster');
 }
 async function decode(id){
  if(!state.out.has('decoder')||!state.out.has(id))return;
  await clearDecode();const card=nodes.get(id);
  await motion.move(card,card.position,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
  const placement=calibration.registrations.find(r=>r.card===id)?.placement??{x:0,y:0,angle:0};
  if(state.held)await exitView();
  // Two actual surface half-thicknesses plus 0.01 mm clearance; no floating filter.
  const target=card.position.clone().add(new THREE.Vector3(placement.x,placement.y,.0265)),lifted=parts.decoder.position.clone();lifted.z=5;await motion.move(parts.decoder,lifted);const above=target.clone();above.z=5;await motion.move(parts.decoder,above,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),placement.angle));await motion.move(parts.decoder,target);state.decoded=id;state.selected='decoder';await inspect('decoder');
 }
 function actions(){
  const result=[],add=(id,label,run,disabled='')=>result.push({id,label,run,disabled});const id=state.selected;
  if(state.held)add('exit','退出单件查看',()=>exitView());
  if(id&&state.out.has(id)){
   if(id!=='clip')add('inspect','放大查看',()=>inspect(id));
   if(!['folder','poster','band','clip'].includes(id)&&!state.decoded)add('flip','翻到另一面',async()=>{const n=nodes.get(id);await motion.move(n,n.position,n.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI)));});
   add('put','放回'+names[id],()=>put(id),reasonPut(id));
  }
  if(id==='poster'&&state.out.has(id))add('unfold',['展开左侧','展开右侧','向上展开','向下展开','折回海报'][state.posterStep],unfold);
  if(state.out.has('decoder')&&cardIds.includes(id)&&state.out.has(id))add('decode','叠放解密卡',()=>decode(id));
  if(id==='decoder'&&state.decoded)add('uncover','移开解密卡',clearDecode);
  if(id==='decoder'&&!state.decoded)for(const card of cardIds.filter(k=>state.out.has(k)))add('decode-'+card,'叠放到'+names[card],()=>decode(card));
  if(folderOpen()&&cardIds.some(k=>!state.out.has(k))&&(!state.held||state.held==='folder'))add('cards-spread','取出并摊开全部歌词卡',spreadCards);
  const available=['band',...layerIds,'clip','label','list','disc'].filter(k=>!state.out.has(k)&&!reasonTake(k));
  for(const key of available)if(!state.held||key===id||cardIds.includes(key)&&cardIds.includes(id))add('take-'+key,'取出'+names[key],()=>take(key));
  const toggles=[];
  if(state.out.has('band')){for(const k of ['top','bottom','left','right']){const key='case-'+k;if(k==='top'||state.open.has('case-top')&&(k==='bottom'||state.open.has('case-bottom')))toggles.push(key);}}
  if(state.out.has('folder')){toggles.push('folder-cover');if(folderOpen()){toggles.push('folder-tongue');if(state.open.has('folder-tongue'))toggles.push('folder-retainer');}}
  if(state.out.has('envelope'))toggles.push('envelope-flap');
  for(const key of toggles)if(!state.held&&(!id||id==='case'||id.startsWith('case-')&&key.startsWith('case-')||['folder','folder-cover','folder-tongue','folder-retainer'].includes(id)&&key.startsWith('folder-')||id==='envelope'&&key==='envelope-flap'||id===key))add('toggle-'+key,(state.open.has(key)?'合上':'打开')+names[key],()=>toggle(key));
  return result;
 }
 async function run(fn){if(state.busy)return;state.busy=true;motion.follow([]);viewer.controls.enabled=false;emit('');try{await fn();}finally{motion.follow([]);state.busy=false;viewer.controls.enabled=true;emit();}}
 async function pick(id){
  if(!id)return run(exitView);
  // Attached child surfaces belong to their stored package until it is taken out.
  // Walk the real parent chain so detached labels/cards keep their own actions.
  if(id!=='label')for(let node=nodes.get(id);node;node=node.parent){const owner=node.userData.item;if(['folder','envelope'].includes(owner)&&!state.out.has(owner)){id=owner;break;}}
  if(state.busy)return;state.selected=id;
  return run(async()=>{
   if(id==='label'&&!state.out.has('label')){
    if(!state.out.has('folder'))await take('folder');
    if(!state.out.has('folder'))return;
    if(!state.out.has('clip'))await take('clip');
    await take('label');
   }
   else if(id==='clip'&&state.out.has('clip')){await exitView();emit('回形针已取下，可单独放回');}
   else if(cardIds.includes(id)&&!state.out.has(id))await spreadCards();
   else if(id==='case'){const top=layerIds.find(k=>!state.out.has(k));if(caseOpen()&&top){state.selected=top;await take(top);}else emit('点击需要打开的折片');}
   else if(id.startsWith('case-')||['folder-cover','folder-tongue','folder-retainer','envelope-flap'].includes(id))await toggle(id);
   else if(state.out.has(id))await inspect(id);
   else await take(id);
  });
 }
 async function reset(){return run(async()=>{
  await exitView();await clearDecode();
  async function openCase(){if(!state.out.has('band'))await take('band');for(const key of ['top','bottom','left','right'])if(!state.open.has('case-'+key))await toggle('case-'+key);}
  const looseFolder=[...cardIds,'list','label','clip'].some(id=>state.out.has(id));
  if(layerIds.some(id=>state.out.has(id))||looseFolder||state.out.has('disc'))await openCase();
  const deepest=layerIds.reduce((last,id,i)=>state.out.has(id)?i:last,-1);for(let i=0;i<deepest;i++)if(!state.out.has(layerIds[i]))await take(layerIds[i]);
  if(looseFolder&&!state.out.has('folder'))await take('folder');
  if(cardIds.some(id=>state.out.has(id))){for(const id of ['folder-cover','folder-tongue','folder-retainer'])if(!state.open.has(id))await toggle(id);}
  if(state.out.has('disc')){if(!state.out.has('envelope')){if(!state.out.has('folder'))await take('folder');await take('envelope');}if(!state.open.has('envelope-flap'))await toggle('envelope-flap');}
  // Canonical packing order. Never replay card viewing / flipping history.
  for(const id of [...cardIds].reverse())await put(id,{force:true});
  await closeFolder();for(const id of ['disc','list','label','clip'])await put(id,{force:true});
  await foldPoster();
  for(const id of [...layerIds].reverse())await put(id,{force:true});
  for(const key of ['right','left','bottom','top'])if(state.open.has('case-'+key))await toggle('case-'+key);
  await put('band',{force:true});state.selected='band';await follow('case');
 });}
 viewer.fit([parts.body,parts.band],{front:false});emit();
 return {state,nodes,pick,reset,act:id=>{const a=actions().find(a=>a.id===id);return a&&!a.disabled?run(a.run):Promise.resolve();},select:id=>{state.selected=id;emit();},reasonTake,reasonPut,decodeText};
}
