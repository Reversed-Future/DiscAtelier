// Authoring only. Every reversible edge is explicitly assigned to its physical part.
// Chained edges close/fold that same part before it travels back to its container.
export function partInteraction(model,specs,{initialView=[]}={}){
 const states=new Map(model.states.map(s=>[s.id,s])),actions=new Map(model.actions.map(a=>[a.id,a])),edges=new Map();
 for(const spec of specs){
  const {id,part,label,view=[part],returnLabel,continueReturn=false,forwardReturn=false}=spec,a=actions.get(id);
  if(!a)throw Error(`Missing authored action: ${id}`);
  Object.assign(a,{part,label,view});
  if(returnLabel){const from=forwardReturn?a.from:a.to,list=edges.get(from)??[];list.push({part,label:returnLabel,continueReturn,step:{action:id,reverse:!forwardReturn},to:forwardReturn?a.to:a.from});edges.set(from,list);}
 }
 for(const state of model.states){
  state.returns=[];
  for(const edge of edges.get(state.id)??[]){
   const steps=[edge.step],seen=new Set([state.id]);let next=edge;
   while(next.continueReturn){
    if(seen.has(next.to))throw Error('Part return cycle');seen.add(next.to);
    const options=(edges.get(next.to)??[]).filter(e=>e.part===edge.part);
    if(options.length!==1)throw Error(`Incomplete part return: ${state.id}/${edge.part}`);
    next=options[0];steps.push(next.step);
   }
   if(state.returns.some(r=>r.target===edge.part))throw Error(`Duplicate part return: ${state.id}/${edge.part}`);
   state.returns.push({target:edge.part,label:next.label,steps});
  }
 }
 model.navigation={...model.navigation,preserveOverview:true,followActions:true};
 states.get(model.initialState).view=initialView;
 return model;
}
