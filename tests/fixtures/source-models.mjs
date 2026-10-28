// Original, reproducible fixtures; no user assets or third-party artwork.
import {deflateSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function png(){
  function crc(bytes){let c=0xffffffff;for(const v of bytes){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  function chunk(type,data){const name=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([len,name,data,sum]);}
  const ihdr=Buffer.from([0,0,0,2,0,0,0,2,8,2,0,0,0]);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,255,80,20,20,80,255,0,20,255,80,255,230,40]))),chunk('IEND',Buffer.alloc(0))]);
}
export const texture=png();
const positions=[-1,-1,0,1,-1,0,0,1,0];
export function glb(){
  const chunks=[],views=[];let offset=0;
  function data(bytes){const index=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);offset+=padded.length;return index;}
  const floats=values=>Buffer.from(new Float32Array(values).buffer);
  const p=data(floats(positions)),uv=data(floats([0,0,1,0,.5,1])),times=data(floats([0,1,2])),move=data(floats([0,0,0,1,0,0,0,0,0])),image=data(texture);
  const json={asset:{version:'2.0',generator:'DiscAtelier synthetic fixture'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'Triangle'}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material:0}]}],accessors:[{bufferView:p,componentType:5126,count:3,type:'VEC3',min:[-1,-1,0],max:[1,1,0]},{bufferView:uv,componentType:5126,count:3,type:'VEC2'},{bufferView:times,componentType:5126,count:3,type:'SCALAR',min:[0],max:[2]},{bufferView:move,componentType:5126,count:3,type:'VEC3'}],materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}],textures:[{source:0}],images:[{bufferView:image,mimeType:'image/png'}],animations:[{name:'Slide',channels:[{sampler:0,target:{node:0,path:'translation'}}],samplers:[{input:2,output:3,interpolation:'LINEAR'}]}],buffers:[{byteLength:offset}],bufferViews:views};
  const raw=Buffer.from(JSON.stringify(json)),j=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(j);const b=Buffer.concat(chunks);
  return Buffer.concat([u32(0x46546c67),u32(2),u32(12+8+j.length+8+b.length),u32(j.length),u32(0x4e4f534a),j,u32(b.length),u32(0x004e4942),b]);
}
const n=(name,props=[],children=[])=>({name,props,children});
const nodes=[n('FBXHeaderExtension',[],[n('FBXHeaderVersion',[1003]),n('FBXVersion',[7400])]),n('Objects',[],[
  n('Geometry',[100,'Geometry::Triangle','Mesh'],[n('Vertices',[{array:positions,type:'d'}]),n('PolygonVertexIndex',[{array:[0,1,-3],type:'i'}])]),
  n('Model',[200,'Model::Triangle','Mesh'],[n('Version',[232])])
]),n('Connections',[],[n('C',['OO',100,200]),n('C',['OO',200,0])])];
function asciiNode(node,depth=0){const tab='\t'.repeat(depth);if(node.props[0]?.array)return `${tab}${node.name}: *${node.props[0].array.length} {\n${tab}\ta: ${node.props[0].array.join(',')}\n${tab}}\n`;const values=node.props.map(p=>typeof p==='string'?JSON.stringify(p):String(p)).join(', ');if(!node.children.length&&['FBXHeaderVersion','FBXVersion','Version','C'].includes(node.name))return `${tab}${node.name}: ${values}\n`;return `${tab}${node.name}: ${values} {\n${node.children.map(c=>asciiNode(c,depth+1)).join('')}${tab}}\n`;}
export const fbxASCII=()=>Buffer.from('; FBX 7.4.0 project file\n'+nodes.map(n=>asciiNode(n)).join(''));
function property(value){
  if(typeof value==='string'){const b=Buffer.from(value);return Buffer.concat([Buffer.from('S'),u32(b.length),b]);}
  if(value.array){const stride=value.type==='d'?8:4,b=Buffer.alloc(value.array.length*stride);value.array.forEach((v,i)=>value.type==='d'?b.writeDoubleLE(v,i*8):b.writeInt32LE(v,i*4));return Buffer.concat([Buffer.from(value.type),u32(value.array.length),u32(0),u32(b.length),b]);}
  const b=Buffer.alloc(9);b[0]=76;b.writeBigInt64LE(BigInt(value),1);return b;
}
function binaryNode(node,start){const name=Buffer.from(node.name),properties=Buffer.concat(node.props.map(property));let offset=start+13+name.length+properties.length;const children=[];for(const child of node.children){const b=binaryNode(child,offset);children.push(b);offset+=b.length;}if(node.children.length){children.push(Buffer.alloc(13));offset+=13;}return Buffer.concat([u32(offset),u32(node.props.length),u32(properties.length),Buffer.from([name.length]),name,properties,...children]);}
export function fbxBinary(){let offset=27;const parts=[];for(const node of nodes){const b=binaryNode(node,offset);parts.push(b);offset+=b.length;}return Buffer.concat([Buffer.from('Kaydara FBX Binary  \0\x1a\0','binary'),u32(7400),...parts,Buffer.alloc(13),Buffer.alloc(176)]);}
export async function writeFixtures(directory){
  await mkdir(join(directory,'materials','textures'),{recursive:true});
  const files=new Map([
    ['animated.glb',glb()],['plain-ascii.fbx',fbxASCII()],['plain-binary.fbx',fbxBinary()],
    ['textured.obj',Buffer.from('mtllib materials/palette.mtl\no Triangle\nv -1 -1 0\nv 1 -1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt .5 1\nusemtl paint\nf 1/1 2/2 3/3\n')],
    ['materials/palette.mtl',Buffer.from('newmtl paint\nKd 1 1 1\nmap_Kd textures/checker colors.png\n')],['materials/textures/checker colors.png',texture],
  ]);
  for(const [name,bytes] of files)await writeFile(join(directory,name),bytes);
  return files;
}
