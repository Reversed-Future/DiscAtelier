import {parseModel, mountModel} from '../../../../packages/atelier-model-runtime';
import {createWorkerHost,installWorkerTextureLoader} from '../../../../packages/atelier-model-runtime/src/discs/interactive/worker-host.js';

installWorkerTextureLoader();
let bridge,handle;
const lifetime=new AbortController();
const message=error=>error instanceof Error?error.message:String(error);
self.onmessage=async({data})=>{
 try{
  if(data.type==='start'){
   data.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();self.postMessage({type:'fatal',error:'模型显示中断，重新打开可重试。'});});
   bridge=createWorkerHost(data.canvas,data.size);
   const response=await fetch(data.url,{signal:lifetime.signal,cache:'no-store'});
   if(!response.ok)throw Error('无法读取模型，请重新打开。');
   const model=parseModel(await response.text());
   handle=await mountModel(bridge.host,model,{signal:lifetime.signal,interactive:data.interactive,
    onChange:state=>self.postMessage({type:'state',state}),onError:error=>self.postMessage({type:'error',error:message(error)})});
   self.postMessage({type:'ready',state:handle.state,bounds:handle.screenBounds()});
  }else if(data.type==='resize')bridge?.resize(data.size);
  else if(data.type==='input')bridge?.event(data.event);
  else if(data.type==='interactive')handle?.setInteractive(data.value);
  else if(data.type==='call'){
   if(!handle)throw Error('模型仍在加载。');
   const methods={reset:()=>handle.reset(),activate:()=>handle.activate(data.value),act:()=>handle.act(data.value),selectPart:()=>handle.selectPart(data.value),putBack:()=>handle.putBack(data.value),exitInspection:()=>handle.exitInspection(),capturePreview:()=>handle.capturePreview()};
   if(!Object.hasOwn(methods,data.method))throw Error('不支持的模型操作。');
   const result=await methods[data.method]();
   self.postMessage({type:'result',id:data.id,result});
  }
 }catch(error){self.postMessage({type:data.type==='call'?'result':'error',id:data.id,error:message(error)});}
};
