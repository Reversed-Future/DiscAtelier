import {assemblyProfiles} from './assembly-profiles.js';
import {embeddedImage} from './model-v2.js';
const fail=message=>{throw Error('模型包：'+message);};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
function jsonData(value,budget={count:0},depth=0){
 if(++budget.count>100000||depth>16)fail('结构数据过大');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>1e7)fail('结构数值无效');return value;}
 if(typeof value==='string'){if(value.length>2048)fail('结构文字过长');return value;}
 if(Array.isArray(value)){if(value.length>10000)fail('结构数组过大');return value.map(v=>jsonData(v,budget,depth+1));}
 if(!record(value))fail('结构数据无效');
 const clean={};for(const [key,v]of Object.entries(value)){
  if(['__proto__','constructor','prototype'].includes(key)||key.length>160)fail('结构字段无效');
  clean[key]=jsonData(v,budget,depth+1);
 }return clean;
}
export function validateV3(value){
 if(value.rig!=='album-assembly-v1'||value.runtimeVersion!==1||!Object.hasOwn(assemblyProfiles,value.profile))fail('不支持的装配结构版本');
 for(const [key,max]of [['id',100],['title',300],['creator',600]])if(!text(value[key],max))fail('模型信息缺失');
 if(!embeddedImage(value.cover))fail('缺少内置封面');
 if(!Array.isArray(value.images)||!value.images.length||value.images.length>100)fail('图片数量无效');
 const images=new Map();for(const row of value.images){
  if(!text(row.id,160)||images.has(row.id)||!embeddedImage(row.image))fail('图片编号或内容无效');
  images.set(row.id,{id:row.id,image:row.image});
 }
 const profile=assemblyProfiles[value.profile];
 if(!Array.isArray(value.textures)||value.textures.length!==profile.textures.length)fail('贴图数量与结构不符');
 const textures=new Map();for(const row of value.textures){
  if(!profile.textures.includes(row.id)||textures.has(row.id)||!images.has(row.image))fail('贴图引用无效');
  textures.set(row.id,{id:row.id,image:row.image});
 }
 if(!record(value.data)||Object.keys(value.data).length!==profile.data.length||profile.data.some(key=>!Object.hasOwn(value.data,key)))fail('装配数据缺失');
 const data=jsonData(value.data);
 if(profile.data.includes('boundaries')){
  if(!record(data.boundaries))fail('纸边数据无效');
  for(const [key,b]of Object.entries(data.boundaries)){
   if(!textures.has(key)||!record(b)||!Array.isArray(b.homography)||b.homography.length!==9||!b.homography.every(Number.isFinite)||!Array.isArray(b.edgeOffsets)||b.edgeOffsets.length!==2||!b.edgeOffsets.every(Number.isFinite))fail('纸边投影无效');
   if(b.centerOffset!==undefined&&(!Array.isArray(b.centerOffset)||b.centerOffset.length!==2||!b.centerOffset.every(Number.isFinite)))fail('纸边中心偏移无效');
   for(const field of ['edgeProfile','sideProfile'])if(b[field]!==undefined&&(!Array.isArray(b[field])||b[field].length!==17||b[field].some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))fail('纸边曲线无效');
  }
 }
 if(profile.data.includes('holePoints')&&(!Array.isArray(data.holePoints)||data.holePoints.length<3||data.holePoints.length>1000||data.holePoints.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))fail('挂孔轮廓无效');
 if(profile.data.includes('holes')&&(!Array.isArray(data.holes)||data.holes.length!==15||data.holes.some(h=>!['x','y','w','h'].every(k=>Number.isFinite(h[k]))||h.w<=0||h.h<=0)))fail('解密孔数据无效');
 if(profile.data.includes('decodeText')&&(!Array.isArray(data.decodeText)||data.decodeText.some(r=>!text(r.card,160)||!Array.isArray(r.words)||r.words.some(w=>!text(w,100)))))fail('解密文字无效');
 if(profile.data.includes('calibration')&&(!record(data.calibration)||!Array.isArray(data.calibration.registrations)))fail('解密配准无效');
 if(profile.data.includes('calibration'))for(const row of data.calibration.registrations){if(!text(row.card,160)||row.placement!==undefined&&(!record(row.placement)||!['x','y','angle'].every(k=>Number.isFinite(row.placement[k]))))fail('解密位置无效');}
 return {format:'atelier-interactive-model',version:3,id:value.id,title:value.title,creator:value.creator,cover:value.cover,rig:value.rig,runtimeVersion:1,profile:value.profile,images:[...images.values()],textures:[...textures.values()],data};
}
