import {validateV2,validateStateGraph} from './model-v2.js';

// V4 adds bounded independent part graphs to the data-only V2 scene contract.
// Older readers must reject version 4 rather than silently omit its interactions.
export function validateV4(value){
 const base=validateV2(value),fail=message=>{throw Error(`模型包：${message}`);};
 if(!Array.isArray(value.controllers)||!value.controllers.length||value.controllers.length>8)fail('独立部件控制器数量无效');
 const nodes=new Map(base.scene.nodes.map(n=>[n.id,n]));
 const geometries=new Map(base.scene.geometries.map(g=>[g.id,g]));
 const globalStates=new Set(base.states.map(s=>s.id)),ids=new Set(),owners=new Set();
 let stateCount=base.states.length,actionCount=base.actions.length;
 const controllers=value.controllers.map(control=>{
  if(typeof control.id!=='string'||!control.id.length||control.id.length>160||ids.has(control.id))fail('控制器编号无效');
  ids.add(control.id);
  if(!nodes.has(control.part))fail('控制器部件不存在');
  if(!Array.isArray(control.enabledIn)||!control.enabledIn.length||new Set(control.enabledIn).size!==control.enabledIn.length||control.enabledIn.some(id=>!globalStates.has(id)))fail('控制器启用状态无效');
  if(control.enabledIn.includes(base.initialState))fail('独立控制器不能在整套初始收纳状态启用');
  if(control.navigation?.stateReset!==true||control.controllers!==undefined)fail('控制器必须提供收起路径且不能嵌套');
  const subtree=new Map();
  for(const [id,node] of nodes){
   for(let n=node;n;n=nodes.get(n.parent))if(n.id===control.part){subtree.set(id,node);break;}
  }
  for(const id of subtree.keys()){if(owners.has(id))fail('独立控制器不能操作重叠部件');owners.add(id);}
  const {states,actions}=validateStateGraph(control,subtree,geometries,{states:2048,actions:10000});
  stateCount+=states.size;actionCount+=actions.size;
  if(stateCount>8192||actionCount>24000)fail('独立交互总数量过大');
  for(const state of states.values()){
   if(state.focus.length||state.inspect?.length||state.returns?.length||state.clicks.some(c=>c.target===null))fail('独立控制器不能隐藏周围部件或接管空白点击');
  }
  for(const action of actions.values())if(action.part!==control.part||action.focus?.length||action.refitFocus)fail('独立动作必须属于本部件且不能改变单件查看');
  return {id:control.id,part:control.part,enabledIn:control.enabledIn,initialState:control.initialState,navigation:{stateReset:true},states:control.states,actions:control.actions};
 });
 return {...base,version:4,controllers};
}
