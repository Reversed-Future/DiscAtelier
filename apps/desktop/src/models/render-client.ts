import {convertFileSrc} from '@tauri-apps/api/core';
import type {ModelHandle,ModelState} from '../../../../packages/atelier-model-runtime';

type Options={signal:AbortSignal;interactive:boolean;onChange(state:ModelState):void;onError(error:unknown):void;onFailure?(error:unknown):void};
export function mountCollectionModel(host:HTMLElement,assetId:string,options:Options):Promise<ModelHandle>{
 return mountWorkerModel(host,convertFileSrc(assetId,'collection-model'),options);
}

export function mountWorkerModel(host:HTMLElement,url:string,options:Options):Promise<ModelHandle>{
 return new Promise((resolve,reject)=>{
  if(options.signal.aborted){reject(options.signal.reason);return;}
  if(!HTMLCanvasElement.prototype.transferControlToOffscreen){reject(Error('当前图形环境不支持后台模型显示，请更新 WebView2。'));return;}
  const canvas=document.createElement('canvas');canvas.className='atelier-canvas';canvas.tabIndex=options.interactive?0:-1;
  canvas.setAttribute('aria-label','三维收藏：拖动旋转，滚轮缩放，方向键旋转，加减键缩放');
  let worker:Worker;
  try{worker=new Worker(new URL('./render.worker.js',import.meta.url),{type:'module'});}catch(error){reject(error);return;}
  host.prepend(canvas);
  const listeners=new AbortController();let disposed=false,ready=false,serial=0,interactive=options.interactive;
  let state:ModelState={step:0,stateId:'',busy:false,held:null,returns:[]};
  let bounds={left:0,top:0,width:0,height:0};
  const pending=new Map<number,{resolve(value:unknown):void;reject(error:unknown):void}>();
  const size=()=>{const rect=canvas.getBoundingClientRect();return {width:host.clientWidth,height:host.clientHeight,pixelRatio:devicePixelRatio,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};};
  const send=(value:object)=>{if(!disposed)worker.postMessage(value);};
  let previousSize='';
  function syncSize(){const value=size(),key=JSON.stringify(value);if(key!==previousSize){previousSize=key;send({type:'resize',size:value});}}
  const observer=new ResizeObserver(syncSize);observer.observe(host);
  function dispose(){
   if(disposed)return;disposed=true;listeners.abort();observer.disconnect();worker.terminate();canvas.remove();options.signal.removeEventListener('abort',abort);
   const reason=options.signal.reason||new DOMException('模型已关闭','AbortError');
   for(const request of pending.values())request.reject(reason);pending.clear();if(!ready)reject(reason);
  }
  function abort(){dispose();}
  options.signal.addEventListener('abort',abort,{once:true});
  function call<T=void>(method:string,value?:string|null):Promise<T>{
   if(disposed)return Promise.reject(new DOMException('模型已关闭','AbortError'));
   return new Promise((yes,no)=>{const id=++serial;pending.set(id,{resolve:result=>yes(result as T),reject:no});send({type:'call',id,method,value});});
  }
  const handle:ModelHandle={reset:()=>call('reset'),activate:value=>call('activate',value),act:value=>call('act',value),selectPart:value=>call('selectPart',value),putBack:value=>call('putBack',value),exitInspection:()=>call('exitInspection'),capturePreview:()=>call<{blob:Blob;width:number;height:number}>('capturePreview'),screenBounds:()=>bounds,
   setInteractive(value){interactive=value;canvas.tabIndex=value?0:-1;syncSize();send({type:'interactive',value});},dispose,get state(){return state;}};
  worker.onmessage=({data})=>{
   if(disposed)return;
   if(data.type==='state'){state=data.state;options.onChange(state);}
   else if(data.type==='ready'){ready=true;state=data.state;bounds=data.bounds;handle.setInteractive(interactive);resolve(handle);}
   else if(data.type==='result'){const request=pending.get(data.id);pending.delete(data.id);if(data.error)request?.reject(Error(data.error));else request?.resolve(data.result);}
   else if(data.type==='error'){const error=Error(data.error);if(!ready){reject(error);dispose();}else options.onError(error);}
   else if(data.type==='fatal'){const error=Error(data.error);if(!ready)reject(error);else (options.onFailure??options.onError)(error);dispose();}
  };
  worker.onerror=event=>{if(disposed)return;event.preventDefault();const error=Error(event.message||'后台模型显示失败。');if(!ready)reject(error);else (options.onFailure??options.onError)(error);dispose();};
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','wheel','keydown','keyup','contextmenu']){
   canvas.addEventListener(type,event=>{
    if(!interactive)return;
    const pointer=event as PointerEvent, wheel=event as WheelEvent, key=event as KeyboardEvent;
    if(type==='contextmenu'||type==='wheel'||(type==='keydown'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(key.key)))event.preventDefault();
    if(type==='pointerdown'){canvas.focus({preventScroll:true});canvas.setPointerCapture(pointer.pointerId);}
    syncSize();
    send({type:'input',event:{type,clientX:pointer.clientX,clientY:pointer.clientY,pageX:pointer.clientX,pageY:pointer.clientY,pointerId:pointer.pointerId,pointerType:pointer.pointerType,button:pointer.button,deltaY:wheel.deltaY,deltaMode:wheel.deltaMode,key:key.key,code:key.code,ctrlKey:key.ctrlKey,metaKey:key.metaKey,altKey:key.altKey}});
   },{signal:listeners.signal,passive:false});
  }
  try{const surface=canvas.transferControlToOffscreen();worker.postMessage({type:'start',canvas:surface,size:size(),url,interactive},[surface]);}
  catch(error){reject(error);dispose();}
 });
}
