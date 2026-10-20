import * as THREE from './vendor/three.module.js';
import {decodeNumbers,resolveActionTracks} from '../../../shared/model-v2.js';
import {createPartControls} from './part-controls.js';
import {transitionView} from './model/view-transition.js';
import {createReadingFrames} from './model/reading-frame.js';
import {followPartView} from './model/action-view.js';

// Tracks contain the complete path. Rewind visits the same path in reverse.
export function applyTrack(node,track,time){
 const times=track.times,values=track.values,size=values.length/times.length;
 let right=1;while(right<times.length-1&&times[right]<time)right++;
 const left=right-1,t=THREE.MathUtils.clamp((time-times[left])/(times[right]-times[left]),0,1);
 if(track.property==='quaternion')node.quaternion.fromArray(values,left*size).slerp(new THREE.Quaternion().fromArray(values,right*size),t);
 else {const result=Array.from({length:size},(_,i)=>THREE.MathUtils.lerp(values[left*size+i],values[right*size+i],t));
  if(track.property==='weights')node.morphTargetInfluences=result;else node[track.property].fromArray(result);
 }
}
export function createGenericSession({viewer,asset,model,onChange=()=>{},onError=()=>{}}){
 const states=new Map(model.states.map(state=>[state.id,state]));
 const sources=new Map(model.actions.map(action=>[action.id,action]));
 const actions=new Map(model.actions.map(action=>[action.id,{...action,tracks:resolveActionTracks(action,sources).map(track=>({...track,values:decodeNumbers(track.values)}))}]));
 const readingFrame=createReadingFrames(asset.nodes,actions,applyTrack);
 const initial=new Map([...asset.nodes].map(([id,node])=>[id,{position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone(),weights:node.morphTargetInfluences?.slice(),visible:node.visible}]));
 let stateId=model.initialState,busy=false,disposed=false,held=null,history=[],cancelFrame,inspectionView=null,homeView;
 let partControls;
 function belongsTo(id,parent){for(let n=asset.nodes.get(id);n;n=n.parent)if(n===asset.nodes.get(parent))return true;return false;}
 const state=()=>({step:history.length,stateId,busy,held,accessible:[...asset.nodes.keys()],returns:(states.get(stateId).returns??[]).filter(r=>!held||belongsTo(r.target,held)||belongsTo(held,r.target))});
 const emit=()=>{if(!disposed){const s=state();partControls?.update(s);onChange(s);}};
 function animate(duration,apply){
  if(disposed)return Promise.reject(Error('Session disposed'));
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){apply(1);return Promise.resolve();}
  return new Promise((resolve,reject)=>{const start=performance.now();let frame;
   cancelFrame=()=>{cancelAnimationFrame(frame);reject(Error('Session disposed'));};
   const tick=now=>{const t=Math.min(1,(now-start)/duration);apply(t);if(t<1)frame=requestAnimationFrame(tick);else{cancelFrame=null;resolve();}};frame=requestAnimationFrame(tick);
  });
 }
 function visibleFor(ids){
  const keep=new Set();for(const id of ids){let node=asset.nodes.get(id);node.traverse(child=>keep.add(child));while(node){keep.add(node);node=node.parent;}}
  for(const [id,node] of asset.nodes)node.visible=initial.get(id).visible&&(!ids.length||keep.has(node));
 }
 async function focus(ids){
  visibleFor(ids);const objects=ids.length?ids.map(id=>asset.nodes.get(id)):[asset.root];
  const proxies=ids.map(readingFrame).filter(Boolean);
  const from=viewer.snapshot();
  try{viewer.fit([...objects,...proxies],{front:ids.length>0,overview:ids.length===0});}finally{for(const proxy of proxies)proxy.geometry.dispose();}
  const to=viewer.snapshot();viewer.restore(from);
  await transitionView(viewer,to,animate);
 }
 async function frame(ids){
  if(!ids?.length)return;
  const from=viewer.snapshot();viewer.fit(ids.map(id=>asset.nodes.get(id)),{preserve:true});const to=viewer.snapshot();viewer.restore(from);
  await transitionView(viewer,to,animate);
 }
 async function exitInspection(){
  if(!held)return;held=null;visibleFor(states.get(stateId).focus);
  if(inspectionView){const to=inspectionView;inspectionView=null;await transitionView(viewer,to,animate);}
 }
 async function locked(callback){if(busy||disposed)return;busy=true;viewer.controls.enabled=false;emit();try{await callback();}catch(error){if(!disposed){onError(error);throw error;}}finally{busy=false;if(!disposed)viewer.controls.enabled=true;emit();}}
 async function play(action,reverse=false){
  const follow=model.navigation?.followActions&&!held&&action.view?.length;
  const updateView=follow?followPartView(viewer,asset.root,action.view.map(id=>asset.nodes.get(id))):null;
  await animate(action.duration,t=>{const time=(reverse?1-t:t)*action.duration;for(const track of action.tracks)applyTrack(asset.nodes.get(track.node),track,time);
   updateView?.();
  });viewer.controls.update();
 }
 async function pick(id){return locked(async()=>{
  const current=states.get(stateId),click=current.clicks.find(click=>click.target===id);
  if(click){const action=actions.get(click.action);
   if(action.keepFocus){if(action.focus?.length&&held!==action.focus[0]){if(!held)inspectionView=viewer.snapshot();held=action.focus[0];await focus(action.focus);}await play(action);stateId=action.to;if(action.refitFocus)await focus(action.focus);return;}
   await exitInspection();if(action.focus)await focus(action.focus);await play(action);history.push(action.id);stateId=action.to;
   const next=states.get(stateId);if(model.navigation?.followActions){visibleFor(next.focus);await frame(action.view);}else if(model.navigation?.preserveOverview&&!current.focus.length&&!next.focus.length){visibleFor([]);}else await focus(next.focus);
  }
  else if(id===null||held===id){await exitInspection();}
  else if(asset.nodes.has(id)){
   let inspect=id;if(current.inspect){inspect=null;for(let node=asset.nodes.get(id);node;node=node.parent){const key=node.name;if(current.inspect.includes(key)){inspect=key;break;}}}
   if(inspect){if(!held)inspectionView=viewer.snapshot();held=inspect;await focus([inspect]);}
  }
 });}
 async function putBack(target){return locked(async()=>{
  const option=states.get(stateId).returns?.find(r=>r.target===target);if(!option)return;
  await exitInspection();visibleFor([]);
  for(const step of option.steps){const action=actions.get(step.action);await frame(action.view??[target]);await play(action,!!step.reverse);stateId=step.reverse?action.from:action.to;}
  // The return is a state transition, not a rewind of unrelated user actions.
  history=[];await frame(actions.get(option.steps.at(-1).action).view??[target]);
 });}
 async function reset(){return locked(async()=>{
  const view=viewer.snapshot(),atHome=view.position.distanceToSquared(homeView.position)<1e-8&&view.target.distanceToSquared(homeView.target)<1e-8&&view.up.distanceToSquared(homeView.up)<1e-8;
  if(stateId===model.initialState&&!held&&!history.length&&atHome)return;
  await exitInspection();inspectionView=null;
  if(model.navigation?.stateReset){
   let assemblyView=false;
   while(stateId!==model.initialState){const spec=states.get(stateId).reset,action=actions.get(spec.action);if(model.navigation.followActions){visibleFor([]);await frame(action.view);}else if(!spec.reverse)await focus(states.get(stateId).focus.length?states.get(stateId).focus:action.focus??states.get(action.to).focus);else {visibleFor([]);if(!assemblyView){viewer.restore(homeView);assemblyView=true;}}await play(action,!!spec.reverse);stateId=spec.reverse?action.from:action.to;}
  }else{await focus([]);for(const id of [...history].reverse()){const action=actions.get(id);await play(action,true);stateId=action.from;}}
  history=[];stateId=model.initialState;
  for(const [id,pose] of initial){const node=asset.nodes.get(id);node.position.copy(pose.position);node.quaternion.copy(pose.quaternion);node.scale.copy(pose.scale);if(pose.weights)node.morphTargetInfluences=pose.weights.slice();}
  visibleFor(states.get(stateId).focus);if(states.get(stateId).view?.length)await frame(states.get(stateId).view);else await focus(states.get(stateId).focus);
  await transitionView(viewer,homeView,animate);
 });}
 visibleFor(states.get(stateId).focus);viewer.fit(states.get(stateId).view?.length?states.get(stateId).view.map(id=>asset.nodes.get(id)):[asset.root],{overview:true});homeView=viewer.snapshot();
 partControls=createPartControls(viewer,{putBack,exitInspection:()=>pick(null),onError});emit();
 return {pick,putBack,reset,dispose(){disposed=true;cancelFrame?.();partControls.dispose();},get state(){return state();}};
}
