import {decodeNumbers,resolveActionTracks} from '../../../../shared/model-v2.js';

// Local state machines share the scene, but never overwrite the assembly state.
export function createIndependentControls(model){
 const controls=(model.controllers??[]).map(spec=>{
  const sources=new Map(spec.actions.map(a=>[a.id,a]));
  return {spec,stateId:spec.initialState,states:new Map(spec.states.map(s=>[s.id,s])),actions:new Map(spec.actions.map(a=>[a.id,{...a,tracks:resolveActionTracks(a,sources).map(t=>({...t,values:decodeNumbers(t.values)}))}]))};
 });
 const enabled=(c,stateId)=>c.spec.enabledIn.includes(stateId);
 async function drain(control,play){
  const visited=new Set();
  while(control.stateId!==control.spec.initialState){
   if(visited.has(control.stateId))throw Error('Independent return path loops');
   visited.add(control.stateId);
   const step=control.states.get(control.stateId).reset;
   const action=control.actions.get(step.action);
   await play(action,!!step.reverse);
   control.stateId=step.reverse?action.from:action.to;
  }
 }
 return {
  actions:controls.flatMap(c=>[...c.actions.values()]),
  snapshot:()=>Object.fromEntries(controls.map(c=>[c.spec.id,c.stateId])),
  async pick(target,stateId,play){
   for(const control of controls){
    if(!enabled(control,stateId))continue;
    const click=control.states.get(control.stateId).clicks.find(c=>c.target===target);
    if(!click)continue;
    const action=control.actions.get(click.action);
    await play(action,false);control.stateId=action.to;return action;
   }
   return null;
  },
  async beforeTransition(from,to,play){
   for(const control of controls)if(enabled(control,from)&&!enabled(control,to))await drain(control,play);
  },
  async returnPart(part,play){for(const c of controls)if(c.spec.part===part)await drain(c,play);},
  async reset(play){for(const c of [...controls].reverse())await drain(c,play);},
 };
}
