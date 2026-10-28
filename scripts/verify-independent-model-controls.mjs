import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fixture} from '../tests/model-v4-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const model=fixture(40);
model.scene.geometries=[{id:'surface',attributes:{position:{itemSize:3,array:[0,0,0,1,0,0,0,1,0]}},groups:[]}];
model.scene.materials=[{id:'paper',type:'standard',values:{roughness:.9},maps:{}}];
for(const n of model.scene.nodes)if(['upper','lower','other'].includes(n.id))n.mesh={geometry:'surface',materials:['paper']};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<div id="host" style="width:900px;height:650px"></div>');return;}
  if(url.pathname==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(model));return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const report=await page.evaluate(async()=>{
  const base='/packages/atelier-model-runtime/';
  const {parseModel}=await import(base+'index.js');
  const {createViewer}=await import(base+'src/discs/interactive/model/viewer.js');
  const {createGenericAsset}=await import(base+'src/discs/interactive/generic-asset.js');
  const {createGenericSession}=await import(base+'src/discs/interactive/generic-session.js');
  const model=parseModel(await (await fetch('/fixture.json')).text());
  const viewer=createViewer(document.getElementById('host'),()=>{}),asset=await createGenericAsset(viewer.renderer,model.scene);
  viewer.root.add(asset.root);const session=createGenericSession({viewer,asset,model});viewer.start();
  await session.pick('book');
  viewer.camera.position.addScalar(1);viewer.controls.target.x+=.3;viewer.controls.update();
  const before=viewer.snapshot(),visible=[...asset.nodes].map(([id,n])=>[id,n.visible]);
  let drift=0,frames=0,running=true;
  const check=()=>{const now=viewer.snapshot();drift=Math.max(drift,now.position.distanceTo(before.position),now.target.distanceTo(before.target),now.up.distanceTo(before.up));frames++;if(running)requestAnimationFrame(check);};check();
  await session.pick('upper');await session.pick('lower');await session.pick('upper');
  running=false;
  const position=session.state.controllers.reading;
  const visibilityStable=JSON.stringify(visible)===JSON.stringify([...asset.nodes].map(([id,n])=>[id,n.visible]));
  await session.pick('book');
  const result={frames,drift,position,visibilityStable,returned:session.state.stateId==='stored',controllerReturned:session.state.controllers.reading==='page-0-0',upper:asset.nodes.get('upper').position.toArray(),lower:asset.nodes.get('lower').position.toArray()};
  session.dispose();asset.dispose();viewer.dispose();return result;
 });
 assert.ok(report.frames>3);assert.ok(report.drift<1e-8);assert.equal(report.position,'page-2-1');assert.ok(report.visibilityStable&&report.returned&&report.controllerReturned);
 assert.deepEqual(report.upper,[0,0,0]);assert.deepEqual(report.lower,[0,0,0]);assert.deepEqual(errors,[]);
 await mkdir(path.join(root,'artifacts'),{recursive:true});await writeFile(path.join(root,'artifacts/model-v4-controls.json'),JSON.stringify({...report,errors},null,2));
 console.log(JSON.stringify(report));
}finally{await browser.close();server.close();}
