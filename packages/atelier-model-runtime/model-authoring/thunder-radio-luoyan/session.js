import {createAssemblyView} from '../assembly-view.js';
import {THREE} from './surfaces.js';
import {makeMotion} from '../research-bai/motion.js';
import {d} from './dimensions.js';
export function createSession({root,viewer,parts,onChange}){
 const {box,flap,tongue,tabs,tray,cassette}=parts,motion=makeMotion(viewer,root);
 const state={busy:false,open:false,trayOut:false,cassetteOut:false,flipped:false,selected:'box'};
 const stored=cassette.position.clone(),nodes=new Map();root.traverse(n=>{if(n.userData.modelId)nodes.set(n.userData.modelId,n);});
 const view=createAssemblyView({root,viewer,motion}),showAll=()=>view.show();
 function emit(){
  const actions=[{id:'inspect',label:'单件查看'},{id:'overview',label:view.held?'退出单件查看':'查看全套'},{id:'open',label:state.open?'合上盒口':'打开盒口'},
   {id:'tray',label:state.trayOut?'放回内托':'抽出内托'},
   {id:'cassette',label:state.cassetteOut?'放回磁带盒':'取出磁带盒'}];
  if(state.cassetteOut)actions.push({id:'flip',label:'翻看磁带盒另一面'});
  actions.push({id:'back',label:'查看外盒背面'});
  onChange({...state,actions,message:state.busy?'正在操作…':state.selected==='cassette'?'磁带盒 · 保持塑封，可查看六面':state.selected==='tray'&&state.trayOut?'内托 · 丝绸固定包覆海绵，点击磁带盒取出':state.open?'盒口已打开 · 点击内托抽出':'点击盒口打开，或直接选择要取出的部件'});
 }
 async function focus(node){await view.frame([node]);}
 async function open(){
  if(state.open)return;showAll();motion.follow([box]);
  // Withdraw the attached tongue beyond the rear edge before straightening it.
  await motion.tween(t=>{flap.rotation.x=-Math.PI/2+1.08*t;tongue.rotation.x=-Math.PI/2-1.08*t;parts.bendTongue(box);});
  await motion.angles([[tongue,'x',0]]);
  await motion.angles([[flap,'x',.32]]);
  await motion.angles([[tabs[0],'z',Math.PI/2],[tabs[1],'z',-Math.PI/2]]);state.open=true;
 }
 async function close(){
  if(!state.open)return;showAll();motion.follow([box]);
  await motion.angles([[tabs[0],'z',0],[tabs[1],'z',0]]);
  await motion.angles([[flap,'x',-Math.PI/2+1.08]]);
  await motion.angles([[tongue,'x',-Math.PI/2-1.08]]);
  await motion.tween(t=>{const a=1.08*(1-t);flap.rotation.x=-Math.PI/2+a;tongue.rotation.x=-Math.PI/2-a;parts.bendTongue(box);});state.open=false;
 }
 async function takeTray(){
  if(state.trayOut)return;await open();showAll();motion.follow([tray]);
  await motion.move(tray,[0,17.2,.075]);await motion.move(tray,[0,20,.075]);state.trayOut=true;
 }
 async function takeCassette(){
  if(state.cassetteOut)return;await takeTray();showAll();motion.follow([cassette]);
  await motion.move(cassette,[0,0,4]);root.updateMatrixWorld(true);root.attach(cassette);
  await motion.move(cassette,[15,20,4.075]);await motion.move(cassette,[15,20,1.4]);state.cassetteOut=true;state.flipped=false;
 }
 async function putCassette(){
  if(!state.cassetteOut)return;showAll();await focus(cassette);motion.follow([cassette]);
  await motion.move(cassette,[15,20,4.075],new THREE.Quaternion());
  await motion.move(cassette,[0,20,4.075]);root.updateMatrixWorld(true);tray.attach(cassette);
  await motion.move(cassette,stored,new THREE.Quaternion());state.cassetteOut=false;state.flipped=false;
 }
 async function putTray(){
  if(!state.trayOut)return;await putCassette();await open();showAll();await focus(tray);motion.follow([tray]);
  await motion.move(tray,[0,17.2,.075]);await motion.move(tray,[0,0,.075]);state.trayOut=false;
 }
 async function run(fn,reveal=true){if(state.busy)return;state.busy=true;motion.follow([]);viewer.controls.enabled=false;emit();try{if(reveal)await view.exit();await fn();}finally{motion.follow([]);state.busy=false;viewer.controls.enabled=true;emit();}}
 async function act(id){return run(async()=>{
  if(id==='overview'){await view.overview();}
  if(id==='inspect'){await view.inspect(parts[state.selected]);}
  if(id==='open'){state.selected='box';if(state.open)await close();else await open();await focus(box);}
  if(id==='tray'){state.selected='tray';if(state.trayOut){await putTray();await focus(box);}else{await takeTray();await focus(tray);}}
  if(id==='cassette'){state.selected='cassette';if(state.cassetteOut){await putCassette();state.selected='tray';await focus(tray);}else{await takeCassette();await focus(cassette);}}
  if(id==='flip'&&state.cassetteOut){state.flipped=!state.flipped;await motion.move(cassette,cassette.position.clone(),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),state.flipped?Math.PI:0));}
  if(id==='back'){state.selected='box';await focus(box);const view=viewer.snapshot();view.position.sub(view.target).negate().add(view.target);await motion.cameraTo(view);}
 },!['overview','inspect','flip'].includes(id));}
 async function pick(id){
  if(!id)return act('overview');let n=nodes.get(id);while(n&&!['box','tray','cassette'].includes(n.userData.modelId))n=n.parent;
  const part=n?.userData.modelId;if(part==='cassette'){if(state.cassetteOut&&view.held!==cassette)return select('cassette');return act(state.cassetteOut?'flip':'cassette');}if(part==='tray')return act('tray');if(part==='box')return act('open');
 }
 async function select(id){return run(async()=>{state.selected=id;await view.inspect(parts[id]);});}
 async function reset(){return run(async()=>{await putCassette();await putTray();await close();state.selected='box';showAll();await focus(box);});}
 viewer.fit([root],{front:true});emit();return {state,act,pick,select,reset,nodes,motion};
}
