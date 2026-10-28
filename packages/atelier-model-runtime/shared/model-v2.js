// Version 2 is data only: no rig names, executable scripts or remote resources.
const fail=message=>{throw Error(`模型包：${message}`);};
export const embeddedImage=value=>typeof value==='string'&&value.length<=16*1024*1024&&/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e7;
const vector=(value,size)=>Array.isArray(value)&&value.length===size&&value.every(finite);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=160;
export function decodeNumbers(value,type='Float32Array'){
 if(Array.isArray(value))return value;
 if(!value||value.encoding!=='base64'||!['Float32Array','Uint32Array'].includes(type)||typeof value.data!=='string'||!Number.isInteger(value.count)||value.count<0||value.count>6e6||value.data.length!==Math.ceil(value.count*4/3)*4)fail('无效的数值缓冲区');
 let binary;try{binary=atob(value.data);}catch{fail('缓冲区不是有效的 Base64');}
 if(binary.length!==value.count*4)fail('缓冲区长度不符');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const view=new DataView(bytes.buffer),numbers=type==='Uint32Array'?new Uint32Array(value.count):new Float32Array(value.count);
 for(let i=0;i<numbers.length;i++)numbers[i]=type==='Uint32Array'?view.getUint32(i*4,true):view.getFloat32(i*4,true);
 return numbers;
}
function table(values,name,max){
 if(!Array.isArray(values)||values.length>max)fail(`${name}数量无效`);
 const map=new Map();for(const value of values){if(!id(value.id)||map.has(value.id))fail(`${name}编号缺失或重复`);map.set(value.id,value);}return map;
}
export const materialNumbers=['roughness','metalness','opacity','transmission','thickness','ior','clearcoat','clearcoatRoughness','envMapIntensity','bumpScale','normalScale','iridescence','iridescenceIOR','alphaTest','side'];
export const materialColors=['color','emissive','attenuationColor'];
export const materialBooleans=['transparent','depthWrite','depthTest','flatShading'];
export const materialMaps=['map','normalMap','bumpMap','roughnessMap','metalnessMap','alphaMap','emissiveMap'];
export function resolveActionTracks(action,actions){
 const seen=new Set();let current=action;
 while(current?.tracksFrom!==undefined){
  if(seen.has(current.id)||current.tracks!==undefined||!id(current.tracksFrom))fail('共享动画引用无效');
  seen.add(current.id);const source=actions.get(current.tracksFrom);
  if(!source||source.duration!==current.duration)fail('共享动画来源或时长无效');
  current=source;
 }
 if(!Array.isArray(current?.tracks))fail('动画轨道缺失');
 return current.tracks;
}
export function validateV2(value){
 if(!embeddedImage(value.cover))fail('缺少内置 PNG/WebP 封面');
 const scene=value.scene;if(!scene||scene.up!=='Z')fail('scene.up 必须为 Z');
 const nodes=table(scene.nodes,'部件',3000),geometries=table(scene.geometries,'几何体',3000),materials=table(scene.materials,'材质',500),textures=table(scene.textures,'贴图',300);
 if(!nodes.size)fail('场景为空');
 let vertices=0;
 for(const geometry of geometries.values()){
  if(!geometry.attributes?.position)fail('几何体缺少顶点');let count;
  for(const [key,attribute] of Object.entries(geometry.attributes)){
   const size={position:3,normal:3,uv:2,uv1:2,color:3}[key];if(!size||attribute.itemSize!==size)fail('不支持的顶点属性');
   const numbers=decodeNumbers(attribute.array);if(numbers.length%size||!numbers.every(finite))fail('顶点属性数值无效');
   if(key==='position'){count=numbers.length/size;vertices+=count;}
  }
  for(const attribute of Object.values(geometry.attributes))if(decodeNumbers(attribute.array).length/attribute.itemSize!==count)fail('顶点属性数量不一致');
  if(vertices>1500000)fail('顶点总数超过 150 万');
  const index=geometry.index===undefined?null:decodeNumbers(geometry.index,'Uint32Array');
  if(index&&(!index.every(n=>Number.isInteger(n)&&n>=0&&n<count)||index.length%3))fail('三角形索引无效');
  if(!index&&count%3)fail('非索引几何体必须由三角形组成');
  for(const group of geometry.groups??[])if(![group.start,group.count,group.materialIndex].every(n=>Number.isInteger(n)&&n>=0)||group.start+group.count>(index?.length??count))fail('材质分组越界');
  for(const [key,targets] of Object.entries(geometry.morphAttributes??{})){
   if(!['position','normal'].includes(key)||!Array.isArray(targets)||targets.length>256)fail('形变属性无效');
   for(const target of targets){const numbers=decodeNumbers(target);if(numbers.length!==count*3||!numbers.every(finite))fail('形变顶点数量不符');}
  }
 }
 for(const texture of textures.values()){
  if(!embeddedImage(texture.image)||!vector(texture.repeat,2)||!vector(texture.offset,2)||!vector(texture.center,2)||!finite(texture.rotation)||typeof texture.flipY!=='boolean'||![1000,1001,1002].includes(texture.wrapS)||![1000,1001,1002].includes(texture.wrapT)||!['','srgb','srgb-linear'].includes(texture.colorSpace))fail('贴图参数无效');
 }
 for(const material of materials.values()){
  if(material.effect!==undefined&&material.effect!=='radial-diffraction')fail('不支持的材质效果');
  if(!['standard','physical','basic'].includes(material.type))fail('材质类型不支持');
  for(const [key,v] of Object.entries(material.values??{})){
   if(materialNumbers.includes(key)){if(key==='normalScale'?!vector(v,2):!finite(v))fail('材质数值无效');}
   else if(materialColors.includes(key)){if(!vector(v,3))fail('材质颜色无效');}
   else if(materialBooleans.includes(key)){if(typeof v!=='boolean')fail('材质开关无效');}
   else fail(`不支持的材质参数 ${key}`);
  }
  for(const [key,v] of Object.entries(material.maps??{}))if(!materialMaps.includes(key)||!textures.has(v))fail('贴图引用无效');
 }
 for(const node of nodes.values()){
  if(node.parent!==null&&!nodes.has(node.parent))fail('父部件不存在');
  if(!vector(node.position,3)||!vector(node.quaternion,4)||!vector(node.scale,3)||node.scale.some(n=>Math.abs(n)<1e-8)||Math.abs(Math.hypot(...node.quaternion)-1)>.002)fail('部件变换无效');
  const seen=new Set([node.id]);let parent=node.parent;
  while(parent!==null){if(seen.has(parent))fail('部件层级存在循环');seen.add(parent);parent=nodes.get(parent).parent;}
  if(node.mesh){if(!geometries.has(node.mesh.geometry)||!Array.isArray(node.mesh.materials)||!node.mesh.materials.length||node.mesh.materials.some(m=>!materials.has(m)))fail('网格引用无效');
   const g=geometries.get(node.mesh.geometry);for(const group of g.groups??[])if(node.mesh.materials.length>1&&group.materialIndex>=node.mesh.materials.length)fail('网格材质分组越界');
   if(node.weights&&(!vector(node.weights,g.morphAttributes?.position?.length??0)))fail('形变权重无效');
  }
 }
 validateStateGraph(value,nodes,geometries);
 return {format:value.format,version:2,id:value.id,title:value.title,creator:value.creator,cover:value.cover,scene,states:value.states,actions:value.actions,initialState:value.initialState,...(value.navigation?{navigation:value.navigation}:{})};
}

// Shared bounded graph validation for the assembly and independently operated parts.
export function validateStateGraph(value,nodes,geometries,limits={states:768,actions:4000}){
 // Independent booklet, tray, discs, inlay and removable obi use 576 states.
 // Geometry, sample-count and file-size limits still bound the package cost.
 const states=table(value.states,'状态',limits.states),actions=table(value.actions,'动作',limits.actions);
 if(value.navigation!==undefined){if(!value.navigation||typeof value.navigation!=='object'||Object.keys(value.navigation).some(k=>!['preserveOverview','stateReset','followActions'].includes(k))||Object.values(value.navigation).some(v=>typeof v!=='boolean'))fail('浏览策略无效');}
 if(!states.has(value.initialState))fail('初始状态不存在');
 for(const state of states.values()){
  if(state.view!==undefined&&(!Array.isArray(state.view)||state.view.some(n=>!nodes.has(n))))fail('状态取景引用无效');
  if(state.returns!==undefined){
   if(!Array.isArray(state.returns)||state.returns.length>100)fail('单件放回配置无效');
   const targets=new Set();
   for(const option of state.returns){
    if(!nodes.has(option.target)||targets.has(option.target)||typeof option.label!=='string'||!option.label.length||option.label.length>100||!Array.isArray(option.steps)||!option.steps.length||option.steps.length>32)fail('单件放回定义无效');targets.add(option.target);
    let current=state.id;const visited=new Set([current]);
    for(const step of option.steps){const a=actions.get(step.action),reverse=step.reverse??false;if(!a||typeof reverse!=='boolean'||(reverse?a.to:a.from)!==current||a.part!==option.target)fail('单件放回路径无效');current=reverse?a.from:a.to;if(visited.has(current))fail('单件放回路径循环');visited.add(current);}
   }
  }
  if(state.inspect!==undefined&&(!Array.isArray(state.inspect)||state.inspect.some(n=>!nodes.has(n))))fail('单件查看范围无效');
  if(state.reset!==undefined){const a=actions.get(state.reset?.action),reverse=state.reset?.reverse??false;if(!a||typeof reverse!=='boolean'||(reverse?a.to:a.from)!==state.id)fail('收起动作引用无效');}
  if(!Array.isArray(state.clicks)||!Array.isArray(state.focus)||state.focus.some(n=>!nodes.has(n)))fail('状态配置无效');
  const triggers=new Set();for(const click of state.clicks){if((click.target!==null&&!nodes.has(click.target))||triggers.has(click.target)||!actions.has(click.action)||actions.get(click.action).from!==state.id)fail('点击动作引用无效');triggers.add(click.target);}
 }
 let samples=0;
 for(const action of actions.values()){
  if(action.part!==undefined&&!nodes.has(action.part))fail('动作所属部件无效');
  if(action.label!==undefined&&(typeof action.label!=='string'||!action.label.length||action.label.length>100))fail('动作名称无效');
  if(action.view!==undefined&&(!Array.isArray(action.view)||action.view.some(n=>!nodes.has(n))))fail('动作取景引用无效');
  if(action.keepFocus!==undefined&&typeof action.keepFocus!=='boolean')fail('动作聚焦设置无效');
  if(action.refitFocus!==undefined&&(typeof action.refitFocus!=='boolean'||!action.keepFocus||!action.focus?.length))fail('动作取景设置无效');
  if(action.focus!==undefined&&(!Array.isArray(action.focus)||action.focus.some(id=>!nodes.has(id))))fail('动作视图引用无效');
  const tracks=resolveActionTracks(action,actions);
  if(!states.has(action.from)||!states.has(action.to)||!finite(action.duration)||action.duration<1||action.duration>120000||tracks.length>9000)fail('动作定义无效');
  const channels=new Set();
  for(const track of tracks){
   if(!nodes.has(track.node)||!['position','quaternion','scale','weights'].includes(track.property)||channels.has(`${track.node}/${track.property}`))fail('动画通道无效');channels.add(`${track.node}/${track.property}`);
   const node=nodes.get(track.node),size=track.property==='quaternion'?4:track.property==='weights'?(geometries.get(node.mesh?.geometry)?.morphAttributes?.position?.length??0):3;
   if(!size||!Array.isArray(track.times)||track.times.length<2||track.times.length>10000||track.times[0]!==0||track.times.at(-1)!==action.duration||track.times.some((t,i)=>!finite(t)||(i>0&&t<=track.times[i-1])))fail('动画时间轴无效');
   const numbers=decodeNumbers(track.values);samples+=numbers.length;if(samples>6e6||numbers.length!==size*track.times.length||!numbers.every(finite))fail('动画采样值无效或过大');
   if(track.property==='quaternion')for(let i=0;i<numbers.length;i+=4)if(Math.abs(Math.hypot(...numbers.slice(i,i+4))-1)>.002)fail('动画四元数未归一化');
   if(track.property==='scale'&&numbers.some(n=>Math.abs(n)<1e-8))fail('动画缩放不能为零');
  }
 }
 const reachable=new Set([value.initialState]);let changed=true;while(changed){changed=false;for(const state of states.values())if(reachable.has(state.id)){
  const destinations=state.clicks.map(click=>actions.get(click.action).to);
  for(const option of state.returns??[])for(const step of option.steps){const a=actions.get(step.action);destinations.push(step.reverse?a.from:a.to);}
  for(const target of destinations)if(!reachable.has(target)){reachable.add(target);changed=true;}
 }}
 if(reachable.size!==states.size)fail('存在无法通过点击到达的状态');
 if(value.navigation?.stateReset)for(const state of states.values()){const seen=new Set();let s=state;while(s.id!==value.initialState){if(seen.has(s.id)||!s.reset)fail('收起流程无法返回初始状态');seen.add(s.id);const a=actions.get(s.reset.action);s=states.get(s.reset.reverse?a.from:a.to);}}
 return {states,actions};
}
