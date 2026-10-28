import {desktopHarness} from './desktop-harness.mjs';
import {writeFixtures} from '../tests/fixtures/source-models.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,extname,basename} from 'node:path';
import assert from 'node:assert/strict';
const harness=await desktopHarness('source-models',process.argv[2],{},process.argv[3]);
const {directory,expect,errors}=harness;const fixtures=join(directory,'fixtures');await writeFixtures(fixtures);
let page;const checks=[];
const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const list=async()=>(await invoke('library_list',{query:{categoryId:'music',status:null,query:''}})).copies;
async function add(path,title){
 await page.locator('.topbar').getByRole('button',{name:'添加收藏',exact:true}).click();
 await page.getByRole('button',{name:'手动录入',exact:true}).click();
 const form=page.getByRole('dialog',{name:'添加收藏',exact:true});
 await form.getByRole('textbox',{name:'名称',exact:true}).fill(title);
 await writeFile(join(directory,'model-selection.txt'),path);
 await form.getByRole('button',{name:'上传模型',exact:true}).click();
 await expect(form.locator('.model-file-title')).toHaveText(basename(path,extname(path)),{timeout:65000});
 await form.getByRole('button',{name:'下一步',exact:true}).click();
 await form.getByRole('button',{name:'加入收藏',exact:true}).click();
 await expect(form).not.toBeVisible({timeout:15000});
 const row=(await list()).find(v=>v.edition.title===title);assert(row?.modelAssetId);
 const text=await invoke('library_model',{assetId:row.modelAssetId,preview:false}),model=JSON.parse(text);
 assert.equal(model.format,'discatelier-source-model');assert.equal(model.sourceFormat,extname(path).slice(1));
 assert.deepEqual(Buffer.from(model.files.find(f=>f.path===model.main).content,'base64'),await readFile(path));assert(model.cover.length>2000);
 await page.getByRole('button',{name:`取出 ${title}`,exact:true}).click();
 await expect(page.locator('.interactive[data-loaded="true"]')).toBeVisible({timeout:30000});
 await expect(page.locator('canvas')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'重置视角',exact:true})).toBeVisible();
 await page.screenshot({path:join(directory,`${title}.png`)});
 const clips=page.getByRole('combobox',{name:'模型动画'});
 if(await clips.count()){
  await clips.selectOption('clip:0');await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
  await page.waitForTimeout(400);await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'停止动画',exact:true}).click();checks.push(`${title}: 动画选择/暂停/停止`);
 }
 await page.getByRole('button',{name:'放回',exact:true}).click();await expect(page.locator('canvas')).toHaveCount(0,{timeout:15000});
 checks.push(`${title}: 原生导入/原始字节一致/生成预览/取出/放回`);return row;
}
try{
 page=await harness.start();
 for(const name of ['animated.glb','textured.obj','plain-ascii.fbx','plain-binary.fbx'])await add(join(fixtures,name),basename(name,extname(name)));
 if(process.argv[4])for(const name of ['RotationTest.fbx','monkey_embedded_texture.fbx','monkey.fbx'])await add(resolve(process.argv[4],name),basename(name,'.fbx'));
 const before=await list(),backup=await invoke('library_backup');
 const prepared=await invoke('library_prepare_restore',{path:backup});assert.equal(prepared.models,before.length);
 await invoke('library_restore',{token:prepared.token});
 await harness.stop();page=await harness.start();assert.equal((await list()).length,before.length);
 await page.locator('.record-sleeve[data-current="true"]').click();await expect(page.locator('.interactive[data-loaded="true"]')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'放回',exact:true}).click();checks.push('备份恢复及原生进程重启后仍可读取');
 // Exact missing-path failure, prior collection remains unchanged.
 await writeFile(join(fixtures,'missing.obj'),'mtllib not-here.mtl\nv 0 0 0\n');
 await writeFile(join(directory,'model-selection.txt'),join(fixtures,'missing.obj'));
 await assert.rejects(()=>invoke('model_choose'));
 assert.equal((await list()).length,before.length);checks.push('缺失 MTL 被拒绝，已保存模型不受影响');
 // Replacing the draft preview must not evict another pending form preparation.
 await writeFile(join(directory,'model-selection.txt'),join(fixtures,'plain-binary.fbx'));
 const a=await invoke('model_choose'),b=await invoke('model_choose');
 const stored=JSON.parse(await invoke('library_model',{assetId:before[0].modelAssetId,preview:false}));
 const c=await invoke('model_source_preview',{token:b.token,cover:stored.cover});
 const readable=await page.evaluate(async token=>(await fetch(`http://prepared-model.localhost/${token}`)).status,a.token);
 assert.equal(readable,200);await invoke('model_release',{token:a.token});await invoke('model_release',{token:c.token});checks.push('生成预览保留其他未保存草稿');
 assert.deepEqual(errors,[]);await writeFile(join(directory,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({directory,checks},null,2));
}catch(error){await page?.screenshot({path:join(directory,'failure.png')}).catch(()=>{});await writeFile(join(directory,'failure.txt'),String(error)+'\n'+JSON.stringify(errors)+'\n'+await page?.content());throw error;}
finally{await harness.stop();}
