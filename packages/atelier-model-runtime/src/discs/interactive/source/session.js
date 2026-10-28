import * as THREE from '../vendor/three.module.js';
import {loadSource} from './load.js';

export async function createSourceSession({viewer,model,signal,onChange}) {
  const asset=await loadSource(model,{signal});
  const frame=new THREE.Group();frame.rotation.x=Math.PI/2;
  const normalized=new THREE.Group();normalized.add(asset.root);frame.add(normalized);viewer.root.add(frame);
  const box=new THREE.Box3().setFromObject(asset.root,true),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const scale=5/Math.max(size.x,size.y,size.z);normalized.scale.setScalar(scale);normalized.position.copy(center).multiplyScalar(-scale);
  viewer.fit([frame],{preserve:true});
  const initial=viewer.snapshot(),mixer=new THREE.AnimationMixer(asset.root);let selected=-1,playing=false,last=performance.now();
  const emit=()=>onChange?.(state());
  function state(){return {step:0,stateId:'source',busy:false,held:null,returns:[],source:{clips:asset.animations.map((clip,index)=>({id:`clip:${index}`,label:clip.name||`动画 ${index+1}`})),selected:selected<0?'':`clip:${selected}`,playing}};}
  const remove=viewer.addFrameListener(time=>{const delta=Math.min((time-last)/1000,.1);last=time;if(playing)mixer.update(delta);});
  async function act(id){
    if(id==='pause'){playing=!playing;emit();return;}
    if(id==='stop'){mixer.stopAllAction();selected=-1;playing=false;emit();return;}
    const index=asset.animations.findIndex((_,i)=>id===`clip:${i}`);if(index<0)return;
    mixer.stopAllAction();selected=index;mixer.clipAction(asset.animations[index]).reset().play();playing=true;last=performance.now();emit();
  }
  async function reset(){await act('stop');viewer.restore(initial);}
  emit();
  return {root:frame,reset,act,pick:async()=>{},dispose(){remove();mixer.stopAllAction();mixer.uncacheRoot(asset.root);frame.removeFromParent();asset.dispose();},get state(){return state();}};
}
