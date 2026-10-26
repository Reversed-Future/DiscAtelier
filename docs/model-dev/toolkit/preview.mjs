import {parseModel,mountModel,modelFileLimit} from './runtime/index.js';
import {downloadModel} from './runtime/model-authoring/export-package.js';
const host=document.querySelector('#viewport'),status=document.querySelector('#status'),controls=document.querySelector('#controls');
let mounted,model,busy=false;
function showError(error){status.textContent=String(error?.message??error);console.error(error);}
function button(label,run,disabled=false){const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>Promise.resolve().then(run).catch(showError);controls.append(b);}
function changed(state){
 controls.replaceChildren();
 for(const option of state.returns??[])button(option.label,()=>mounted.putBack(option.target),state.busy);
 if(state.held)button('返回装配视角',()=>mounted.exitInspection(),state.busy);
 const unpacked=model?.version===2?state.stateId!==model.initialState:state.step>0;
 if(unpacked)button('全部收起',()=>mounted.reset(),state.busy);
}
async function load(next){
 mounted?.dispose();mounted=null;model=null;controls.replaceChildren();document.querySelector('#export').disabled=true;
 model=parseModel(JSON.stringify(next));status.textContent=`加载 ${model.title} · V${model.version}…`;
 mounted=await mountModel(host,model,{onChange:changed,onError:showError});
 changed(mounted.state);document.querySelector('#export').disabled=false;
 status.textContent=`${model.title} · V${model.version} · 当前包 ${new TextEncoder().encode(JSON.stringify(model)).length} bytes · 原生导入待验证`;
 window.authoringPreview={model,runtime:mounted};
}
async function task(run){if(busy)return;busy=true;try{await run();}catch(error){showError(error);}finally{busy=false;}}
document.querySelector('#build').onclick=()=>task(async()=>{const {buildModel}=await import(`./author.mjs?revision=${Date.now()}`);await load(await buildModel());});
document.querySelector('#file').onchange=event=>task(async()=>{const file=event.target.files[0];if(!file)return;if(file.size>modelFileLimit)throw Error('模型文件不能超过 50 MiB');await load(parseModel(await file.text()));});
document.querySelector('#export').onclick=()=>{if(model)downloadModel(model);};
window.addEventListener('beforeunload',()=>mounted?.dispose());
