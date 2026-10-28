// Public OpenSKP corpus outputs produced by the explicit Rust corpus test.
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)), directory=join(root,'artifacts/sketchup-validation');
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const server=createServer(async(req,res)=>{
  try {
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body style="margin:0;background:#181818"><div id="host" style="width:900px;height:700px"></div></body></html>');return;}
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
    if(!path.startsWith(root))throw Error('outside');
    res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(path));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:900,height:700}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(const name of (await readdir(directory)).filter(name=>name.endsWith('.skp.json')).sort()){
  const text=await readFile(join(directory,name),'utf8');
  const result=await page.evaluate(async text=>{
   const {parseModel,mountModel}=await import('/packages/atelier-model-runtime/index.js');
   const {loadSource}=await import('/packages/atelier-model-runtime/src/discs/interactive/source/load.js');
   const {Box3,Vector3}=await import('/packages/atelier-model-runtime/src/discs/interactive/vendor/three.module.js');
   const model=parseModel(text),asset=await loadSource(model);let vertices=0,textures=0,meshes=0;
   asset.root.traverse(o=>{if(o.geometry){meshes++;vertices+=o.geometry.attributes.position.count;}for(const m of [o.material].flat().filter(Boolean))if(m.map?.image?.width)textures++;});
   const bounds=new Box3().setFromObject(asset.root,true),size=bounds.getSize(new Vector3()).toArray();asset.dispose();
   const handle=await mountModel(document.getElementById('host'),model,{interactive:true});window.skpHandle=handle;
   const preview=await handle.capturePreview();return {vertices,textures,meshes,size,min:bounds.min.toArray(),max:bounds.max.toArray(),previewBytes:preview.blob.size};
  },text);
  assert(result.vertices>0);assert(result.previewBytes>1500);
  if(name.includes('png-texture')||name.includes('texture-rotated'))assert(result.textures>0);
  if(name.endsWith('-box.skp.json'))for(const value of result.size)assert(Math.abs(value-1)<1e-5,'1 m cube must remain 1 m');
  if(name.endsWith('-nested-component.skp.json'))assert.equal(result.meshes,2);
  if(name.startsWith('2026-')){
   const first=results.find(r=>r.name===name.replace('2026-','2017-'));assert(first);
   assert.equal(result.vertices,first.vertices);assert.equal(result.meshes,first.meshes);
   result.size.forEach((v,i)=>assert(Math.abs(v-first.size[i])<1e-5,'version geometry differs'));
  }
  if(name.endsWith('-house-plus.skp.json')||name.endsWith('-png-texture.skp.json'))await page.screenshot({path:join(directory,name+'.png')});
  await page.evaluate(()=>skpHandle.dispose());assert.equal(await page.locator('canvas').count(),0);
  results.push({name,...result});console.log(name,result);
 }
 assert.equal(results.length,16);assert.deepEqual(errors,[]);
 await writeFile(join(directory,'render-results.json'),JSON.stringify({results,errors},null,2));
}finally{await browser.close();server.close();}
