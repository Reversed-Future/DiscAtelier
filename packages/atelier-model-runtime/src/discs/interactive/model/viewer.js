import * as THREE from '../vendor/three.module.js';
import {TrackballControls} from '../vendor/TrackballControls.js';
import {RoomEnvironment} from '../vendor/RoomEnvironment.js';
import {createModelClipping} from './view-clipping.js';
import {fitParts} from './framing.js';

export function createViewer(host,onPick,{interactive=true}={}){
  let dirty=true,started=false,enabled=interactive;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  // This pinned Three version replaces PCFSoftShadowMap with PCFShadowMap on
  // first render. Use that same effective filter before compiling shaders.
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const canvas=renderer.domElement;canvas.className='atelier-canvas';canvas.tabIndex=interactive?0:-1;canvas.setAttribute('aria-label','三维收藏：拖动旋转，滚轮缩放，方向键旋转，加减键缩放');host.prepend(canvas);
  const scene=new THREE.Scene(),root=new THREE.Group();root.rotation.x=-Math.PI/2;scene.add(root);
  const studio=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(studio,.04);scene.environment=environment.texture;scene.environmentIntensity=.45;studio.dispose();pmrem.dispose();
  const camera=new THREE.PerspectiveCamera(34,1,.1,150);camera.position.set(5,8,9);
  scene.add(new THREE.HemisphereLight('#fff6e6','#8c948a',1.4));
  const key=new THREE.DirectionalLight('#fff6e7',2);key.position.set(-5,9,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-12;key.shadow.camera.right=12;key.shadow.camera.top=12;key.shadow.camera.bottom=-12;key.shadow.normalBias=.025;key.shadow.bias=-.00015;key.shadow.radius=3;scene.add(key);
  const fill=new THREE.DirectionalLight('#dbe7ed',.7);fill.position.set(6,3,-5);scene.add(fill);
  const controls=new TrackballControls(camera,canvas);controls.rotateSpeed=2;controls.zoomSpeed=2.1;controls.panSpeed=.7;controls.staticMoving=true;controls.minDistance=.6;controls.maxDistance=80;controls.multiTouchRoll=true;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:-1};
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  controls.enabled=interactive;
  // Shared-object travel uses CSS transforms. Size the drawing buffer from the
  // layout box so an intermediate transform cannot lower inspection resolution.
  const resize=()=>{dirty=true;const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();controls.handleResize();};const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const updateClipping=createModelClipping(root,camera);
  function render(){controls.update();updateClipping();renderer.render(scene,camera);dirty=false;}
  const frameListeners=new Set();
  function addFrameListener(fn){frameListeners.add(fn);return ()=>frameListeners.delete(fn);}
  let raf=0;function draw(){if(started&&(enabled||dirty)){for(const fn of frameListeners)fn(performance.now());render();}raf=requestAnimationFrame(draw);}draw();
  function start(){render();started=true;}
  async function capturePreview(){
    const copy=document.createElement('canvas');
    copy.width=canvas.width;copy.height=canvas.height;
    const context=copy.getContext('2d');
    if(!context)throw Error('Preview capture unavailable');
    const begin=performance.now();
    render();context.drawImage(canvas,0,0);
    performance.measure('model.preview_copy',{start:begin,end:performance.now()});
    try{
      const blob=await new Promise((resolve,reject)=>copy.toBlob(value=>value?resolve(value):reject(Error('Preview encoding failed')),'image/png'));
      return {blob,width:copy.width,height:copy.height};
    }finally{copy.width=0;copy.height=0;}
  }
  function setInteractive(value){enabled=value;controls.enabled=value;canvas.tabIndex=value?0:-1;resize();dirty=true;}
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null,moved=false,touchCount=0;
  canvas.addEventListener('pointerdown',e=>{touchCount++;if(touchCount>1)moved=true;if(!down){down={x:e.clientX,y:e.clientY};moved=false;}canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)moved=true;});
  function pickAt(x,y){
    const rect=canvas.getBoundingClientRect();
    pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObject(root,true).find(hit=>{
      for(let p=hit.object;p;p=p.parent)if(!p.visible||p.userData.pickThrough)return false;
      return true;
    });
    if(!hit){requestAnimationFrame(()=>onPick(null));return;}
    let item=hit.object;
    const book=item.userData.bookByMaterial?.[hit.face?.materialIndex];
    while(item&&!item.userData.item)item=item.parent;
    if(item){const id=item.userData.item;requestAnimationFrame(()=>onPick(id,book));}
  }
  canvas.addEventListener('pointerup',e=>{
    touchCount=Math.max(0,touchCount-1);canvas.classList.remove('dragging');
    if(down&&!moved&&e.button===0)pickAt(e.clientX,e.clientY);
    if(down&&!moved&&e.button===2)requestAnimationFrame(()=>onPick(null));
    if(!touchCount)down=null;
  });
  // Picking may disable controls for an animation. Defer it until the
  // document-level pointerup has released TrackballControls' captured pointer.
  canvas.addEventListener('pointercancel',()=>{down=null;touchCount=0;canvas.classList.remove('dragging');});
  canvas.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const offset=camera.position.clone().sub(controls.target),q=new THREE.Quaternion();if(e.key==='+'||e.key==='=')offset.multiplyScalar(.85);else if(e.key==='-')offset.multiplyScalar(1.15);else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const axis=new THREE.Vector3(e.key.includes('Left')||e.key.includes('Right')?0:1,e.key.includes('Left')||e.key.includes('Right')?1:0,0);q.setFromAxisAngle(axis,['ArrowLeft','ArrowUp'].includes(e.key)?.14:-.14);offset.applyQuaternion(q);camera.up.applyQuaternion(q);}else return;e.preventDefault();camera.position.copy(controls.target).add(offset);controls.update();});
  function snapshot(){return {position:camera.position.clone(),up:camera.up.clone(),target:controls.target.clone()};}
  function restore(saved){camera.position.copy(saved.position);camera.up.copy(saved.up);controls.target.copy(saved.target);controls.update();}
  function fit(objects,options){dirty=true;fitParts({scene,camera,controls,updateClipping},objects,options);}
  function zoom(factor){camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();}
  function dispose(){cancelAnimationFrame(raf);observer.disconnect();controls.dispose();key.shadow.map?.dispose();environment.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();}
  return {addFrameListener,renderer,root,scene,camera,controls,fit,zoom,snapshot,restore,updateClipping,start,setInteractive,capturePreview,dispose};
}
