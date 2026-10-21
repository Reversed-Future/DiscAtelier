// Adapt the six trusted sessions to the same contextual return controls as V2.
// Action IDs and flags come from their authored session modules, not labels.
export function assemblyInteractionState(profile,state,partLabels){
 const actions=state.actions??[],returns=[];
 const available=id=>actions.some(action=>action.id===id&&!action.disabled);
 const add=(target,action)=>{
  const label=partLabels.find(([id])=>id===target)?.[1];
  if(label&&available(action))returns.push({target,label:'放回'+label,action});
 };
 let changed=false;
 if(profile==='research-bai'||profile==='nafelibeta2'){
  changed=state.out.size>0||state.open.size>0;
  if(state.out.has(state.selected))add(state.selected,'put');
 }else if(profile==='thunder-radio-luoyan'){
  changed=state.open||state.trayOut||state.cassetteOut;
  if(state.selected==='tray'&&state.trayOut)add('tray','tray');
  if(state.selected==='cassette'&&state.cassetteOut)add('cassette','cassette');
 }else if(['qingluo-decoy','yomei10-rad','ups-and-downs-firdhaus'].includes(profile)){
  changed=state.open||state.obiOut||state.bookOut||state.discOut;
  if(profile==='qingluo-decoy')changed||=Object.values(state.giftFlipped).some(Boolean);
  if(state.selected==='obi'&&state.obiOut)add('obi','obi');
  if(state.selected==='book'&&state.bookOut)add('book','book');
  if(state.selected==='disc'&&state.discOut)add('disc','disc');
 }
 return {step:changed?1:0,held:state.held??null,returns};
}
