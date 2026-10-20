import {validateV2} from './model-v2.js';
export const modelFileLimit=50*1024*1024;
export const modelTextureKeys=['box','kraft','blackPaper','sleeve','sleeveBack','sleeveLeft','sleeveRight','orange','blue','bookAM','bookPM','discAM','discPM','pmCenter','amCenter','amSpine','pmSpine'];
const label=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function validateModelPackage(value){
 if(value?.format==='atelier-interactive-model'&&value.version===2){
  if(!label(value.id,100)||!label(value.title,300)||!label(value.creator,600))throw Error('模型缺少编号、标题或作者。');
  return validateV2(value);
 }
 if(value?.format!=='atelier-interactive-model'||value.version!==1||value.rig!=='jony-j-24-v1')throw Error('不支持的模型格式或结构版本，请使用配套工具制作的 .ateliermodel 文件。');
 if(!label(value.id,100)||!label(value.title,300)||!label(value.creator,600))throw Error('模型缺少编号、标题或作者。');
 if(!value.textures||typeof value.textures!=='object')throw Error('模型缺少贴图。');
 const textures={};
 for(const key of modelTextureKeys){
  const image=value.textures[key];
  if(typeof image!=='string'||image.length>12*1024*1024||!/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))throw Error(`模型贴图 ${key} 无效，必须内置 PNG 或 WebP。`);
  textures[key]=image;
 }
 return {format:value.format,version:1,rig:value.rig,id:value.id,title:value.title,creator:value.creator,textures};
}
export function parseModelPackage(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>modelFileLimit)throw Error('模型文件不能超过 50 MiB。');
 let value;try{value=JSON.parse(text);}catch{throw Error('模型文件不是有效的 JSON。');}
 return validateModelPackage(value);
}
export function validModelUrl(value){
 if(typeof value!=='string'||value.length>2048)return false;
 if(/^\/uploads\/[a-f0-9-]+\.ateliermodel$/.test(value))return true;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.pathname.endsWith('.ateliermodel');}catch{return false;}
}
