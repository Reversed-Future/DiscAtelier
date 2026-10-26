import * as THREE from '../src/discs/interactive/vendor/three.module.js';
import {makeModelPackage} from './export-package.js';
import {partInteraction} from './part-interaction.js';

// Two deliberately different designs, with no box/CD names in the parser.
export function buildExample(kind,{source=false}={}){
 const root=new THREE.Group();
 function part(id,parent=root){const node=new THREE.Group();node.userData.modelId=id;node.userData.item=id;parent.add(node);return node;}
 function block(parent,size,position,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:.6}));mesh.position.set(...position);parent.add(mesh);return mesh;}
 const shell=part('housing');
 block(shell,[3,2.4,.12],[0,0,0],'#374b48');
 block(shell,[.12,2.4,.9],[-1.44,0,.45],'#374b48');block(shell,[.12,2.4,.9],[1.44,0,.45],'#374b48');
 block(shell,[3,.12,.9],[0,1.14,.45],'#374b48');
 const moving=part(kind==='drawer'?'sliding-tray':'hinged-lid');
 const gift=part('keepsake');block(gift,[.8,.6,.3],[0,0,.25],'#d79a60');
 let tracks;
 if(kind==='drawer'){
  block(shell,[3,2.4,.12],[0,0,.96],'#374b48');
  block(moving,[2.66,2.18,.10],[0,0,.16],'#c2b49a');block(moving,[2.7,.12,.75],[0,-1.12,.48],'#c2b49a');
  tracks=['sliding-tray','keepsake'].map(node=>({node,property:'position',times:[0,1000],values:[0,0,0,0,-2.7,0]}));
 }else{
  block(shell,[3,.12,.9],[0,-1.14,.45],'#374b48');moving.position.set(0,1.2,.96);
  block(moving,[3,2.4,.12],[0,-1.2,0],'#c2b49a');
  tracks=[{node:'hinged-lid',property:'quaternion',times:[0,1000],values:[0,0,0,1,...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-2).toArray()]}];
 }
 const start=kind==='drawer'?[0,-2.7,0]:[0,0,0],outside=kind==='drawer'?[2.7,-2.7,0]:[2.7,0,0];
 const all=['housing',moving.userData.modelId,'keepsake'];
 const states=[
  {id:'closed',focus:[],inspect:[],clicks:['housing',moving.userData.modelId].map(target=>({target,action:'open'}))},
  {id:'opened',focus:[],inspect:['housing',moving.userData.modelId],clicks:[{target:'keepsake',action:'take'}],reset:{action:'open',reverse:true}},
  {id:'separated',focus:[],inspect:all,clicks:[],reset:{action:'take',reverse:true}},
 ];
 const actions=[{id:'open',from:'closed',to:'opened',duration:1000,tracks},{id:'take',from:'opened',to:'separated',duration:1200,tracks:[{node:'keepsake',property:'position',times:[0,400,800,1200],values:[...start,start[0],start[1],1.6,outside[0],outside[1],1.6,...outside]}]}];
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle='#374b48';ctx.fillRect(0,0,512,512);ctx.fillStyle='#c2b49a';ctx.fillRect(75,120,362,235);ctx.fillStyle='#374b48';ctx.font='30px sans-serif';ctx.textAlign='center';ctx.fillText(kind==='drawer'?'抽屉收藏盒':'翻盖纪念盒',256,250);
 const definition=partInteraction({id:`example-${kind}`,title:kind==='drawer'?'抽屉收藏盒':'翻盖纪念盒',creator:'Atelier 示例',initialState:'closed',states,actions,navigation:{stateReset:true}},[
  {id:'open',part:moving.userData.modelId,label:kind==='drawer'?'拉开抽屉':'打开盒盖',view:['housing',moving.userData.modelId,'keepsake'],returnLabel:kind==='drawer'?'推回抽屉':'合上盒盖'},
  // Keep the whole teaching assembly in view so the removal path is legible.
  {id:'take',part:'keepsake',label:'取出纪念物',view:all,returnLabel:'放回纪念物'}
 ]),cover=canvas.toDataURL('image/png');
 if(source)return {scene:root.toJSON(),interaction:definition,cover};
 return makeModelPackage({root,...definition,cover});
}
