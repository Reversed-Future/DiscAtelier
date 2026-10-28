import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {writeFixtures,texture} from '../tests/fixtures/source-models.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=join(root,'artifacts/source-runtime');
await mkdir(directory,{recursive:true});const files=await writeFixtures(join(directory,'fixtures'));
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body></body></html>');return;}const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root))throw Error('outside');res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.setContent('<div id="host" style="width:700px;height:600px;background:#202020"></div>');
 for(const name of ['animated.glb','textured.obj','plain-ascii.fbx','plain-binary.fbx']){
  const model={format:'discatelier-source-model',version:1,sourceFormat:extname(name).slice(1),main:name,title:name,cover:`data:image/png;base64,${texture.toString('base64')}`,files:[...files].map(([path,content])=>({path,content:content.toString('base64')}))};
  const result=await page.evaluate(async(model)=>{
   const {parseModel,mountModel}=await import('/packages/atelier-model-runtime/index.js');
   const {loadSource}=await import('/packages/atelier-model-runtime/src/discs/interactive/source/load.js');
   const m=parseModel(JSON.stringify(model)),a=await loadSource(m);let positions=0,textures=0;a.root.traverse(o=>{positions+=o.geometry?.attributes.position?.count||0;for(const mat of [o.material].flat().filter(Boolean))if(mat.map?.image?.width)textures++;});a.dispose();
   const handle=await mountModel(document.getElementById('host'),m,{interactive:true});window.sourceHandle=handle;
   const first=await handle.capturePreview();const data=await first.blob.arrayBuffer();
   return{positions,textures,clips:handle.state.source.clips,bytes:data.byteLength};
  },model);
  assert(result.positions>=3);assert(result.bytes>1500);if(name==='animated.glb'||name==='textured.obj')assert(result.textures>0);
  if(name==='animated.glb'){
   assert.equal(result.clips[0].label,'Slide');
   await page.evaluate(()=>sourceHandle.act('clip:0'));await page.waitForTimeout(350);
   assert.equal(await page.evaluate(()=>sourceHandle.state.source.playing),true);
   await page.evaluate(()=>sourceHandle.act('pause'));assert.equal(await page.evaluate(()=>sourceHandle.state.source.playing),false);
  }
  await page.screenshot({path:join(directory,`${name}.png`)});
  await page.evaluate(()=>sourceHandle.dispose());assert.equal(await page.locator('canvas').count(),0);console.log(name,result);
 }
 assert.deepEqual(errors,[]);await writeFile(join(directory,'results.json'),JSON.stringify({errors,formats:4},null,2));
}finally{await browser.close();server.close();}
