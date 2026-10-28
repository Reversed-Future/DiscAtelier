import fs from 'node:fs';
const cover='data:image/png;base64,'+fs.readFileSync(new URL('../apps/desktop/src-tauri/icons/32x32.png',import.meta.url)).toString('base64');
export function fixture(count=2){
 const node=(id,parent=null)=>({id,parent,position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]});
 const scene={up:'Z',nodes:[node('book'),node('upper','book'),node('lower','book'),node('other')],geometries:[],materials:[],textures:[]};
 const action=(id,from,to,node,begin,end)=>({id,from,to,part:'book',duration:100,keepFocus:true,view:[],tracks:[{node,property:'position',times:[0,100],values:[begin,0,0,end,0,0]}]});
 const states=[],actions=[];
 for(let u=0;u<=count;u++)for(let l=0;l<=count;l++){
  const id=`page-${u}-${l}`,clicks=[];
  for(const [target,du,dl] of [['upper',1,0],['lower',0,1]])for(const dir of [-1,1]){
   const nu=u+du*dir,nl=l+dl*dir;if(nu<0||nl<0||nu>count||nl>count)continue;
   const aid=`${id}-${target}-${dir}`,a=action(aid,id,`page-${nu}-${nl}`,target,du?u:l,du?nu:nl);
   actions.push(a);clicks.push({target:dir>0?target:`${target}-back`,action:aid});
  }
  states.push({id,focus:[],clicks,...(u||l?{reset:{action:`${id}-${u?'upper':'lower'}--1`}}:{})});
 }
 scene.nodes.push(node('upper-back','book'),node('lower-back','book'));
 return {format:'atelier-interactive-model',version:4,id:'split-book',title:'Split book',creator:'test',cover,scene,initialState:'stored',navigation:{stateReset:true},
  states:[{id:'stored',focus:[],clicks:[{target:'book',action:'take'}]},{id:'out',focus:[],clicks:[{target:'book',action:'put'}],reset:{action:'put'}}],
  actions:[action('take','stored','out','book',0,1),action('put','out','stored','book',1,0)],
  controllers:[{id:'reading',part:'book',enabledIn:['out'],initialState:'page-0-0',navigation:{stateReset:true},states,actions}]};
}
