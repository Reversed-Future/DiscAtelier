import * as THREE from './vendor/three.module.js';

// DOM input is forwarded explicitly; the scene, textures and WebGL context stay in this worker.
class InputTarget {
 constructor(){this.listeners=new Map();}
 addEventListener(type,callback){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(callback);}
 removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
 emit(event){for(const callback of [...(this.listeners.get(event.type)||[])])callback.call(this,event);}
}

export function createWorkerHost(canvas, initial) {
 const input=new InputTarget(), documentInput=new InputTarget(), windowInput=new InputTarget();
 let size=initial, resized=()=>{};
 documentInput.documentElement={clientLeft:0,clientTop:0};
 Object.assign(input,{ownerDocument:documentInput,style:{},classList:{add(){},remove(){}},setAttribute(){},setPointerCapture(){},releasePointerCapture(){},remove(){},getBoundingClientRect:()=>size.rect});
 Object.defineProperties(input,{clientWidth:{get:()=>size.width},clientHeight:{get:()=>size.height}});
 Object.assign(windowInput,{pageXOffset:0,pageYOffset:0,innerWidth:size.width,innerHeight:size.height});
 globalThis.window=windowInput;
 globalThis.devicePixelRatio=size.pixelRatio;
 globalThis.matchMedia=()=>({matches:size.reducedMotion});
 const host={renderCanvas:canvas,inputElement:input,prepend(){},getBoundingClientRect:()=>size.rect,observeSize(callback){resized=callback;return()=>{resized=()=>{};};}};
 Object.defineProperties(host,{clientWidth:{get:()=>size.width},clientHeight:{get:()=>size.height}});
 return {
  host,
  resize(value){size=value;windowInput.innerWidth=size.width;windowInput.innerHeight=size.height;resized();},
  event(value){
   const event={...value,preventDefault(){},stopPropagation(){}};
   input.emit(event);
   if(value.type==='pointermove'||value.type==='pointerup')documentInput.emit(event);
   if(value.type==='keydown'||value.type==='keyup')windowInput.emit(event);
  },
 };
}

/** Canvas-backed images retain Three's existing flipY/color-space behavior in workers. */
export function installWorkerTextureLoader() {
 THREE.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){
  const texture=new THREE.Texture(), manager=this.manager;
  const resolved=manager.resolveURL((this.path??'')+url);
  manager.itemStart(resolved);
  void fetch(resolved).then(response=>{if(!response.ok)throw Error('模型贴图读取失败。');return response.blob();})
   .then(blob=>createImageBitmap(blob))
   .then(bitmap=>{
    try{
     const image=new OffscreenCanvas(bitmap.width,bitmap.height), context=image.getContext('2d');
     if(!context)throw Error('无法解码模型贴图。');
     context.drawImage(bitmap,0,0);texture.image=image;texture.needsUpdate=true;onLoad?.(texture);
    }finally{bitmap.close();}
   }).catch(error=>{onError?.(error);manager.itemError(resolved);}).finally(()=>manager.itemEnd(resolved));
  return texture;
 };
}
