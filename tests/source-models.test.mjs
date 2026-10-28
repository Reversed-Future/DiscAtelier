import test from 'node:test';
import assert from 'node:assert/strict';
import {parseModel} from '../packages/atelier-model-runtime/index.js';
import {resourcePath} from '../packages/atelier-model-runtime/shared/source-model.js';
import {FBXLoader} from '../packages/atelier-model-runtime/src/discs/interactive/vendor/source/loaders/FBXLoader.js';
import {OBJLoader} from '../packages/atelier-model-runtime/src/discs/interactive/vendor/source/loaders/OBJLoader.js';
import {fbxASCII,fbxBinary,texture} from './fixtures/source-models.mjs';
test('raw source bytes survive validation; paths reject network and traversal',()=>{
 const model={format:'discatelier-source-model',version:1,sourceFormat:'obj',title:'Original',main:'mesh.obj',cover:`data:image/png;base64,${texture.toString('base64')}`,files:[{path:'mesh.obj',content:Buffer.from('v 0 0 0').toString('base64')}]};
 assert.deepEqual(parseModel(JSON.stringify(model)),model);
 for(const path of ['../secret','https://host/a.png','C:\\secret','/absolute','a/../../secret'])assert.throws(()=>resourcePath(path));
 assert.equal(resourcePath('materials\\textures/checker colors.png'),'materials/textures/checker colors.png');
 assert.throws(()=>parseModel(JSON.stringify({...model,files:[...model.files,...model.files]})));
 assert.throws(()=>parseModel(JSON.stringify({...model,main:'absent.obj'})));
});
for(const [name,fixture] of [['ASCII',fbxASCII],['binary',fbxBinary]])test(`FBX ${name} direct loader preserves triangle geometry`,()=>{
 const bytes=fixture();const root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
 let count=0;root.traverse(o=>{if(o.isMesh)count+=o.geometry.attributes.position.count;});assert.equal(count,3);
});
test('OBJ direct loader preserves separate objects',()=>{
 const root=new OBJLoader().parse('o one\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\no two\nf 3 2 1\n');assert.equal(root.children.length,2);
});
