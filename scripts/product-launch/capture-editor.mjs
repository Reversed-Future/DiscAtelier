// Render the production editor with an in-memory sample. No desktop database is opened.
import {createServer} from '../../node_modules/vite/dist/node/index.js';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE);
const root = process.cwd().replaceAll('\\', '/');
const entry = `${root}/artifacts/product-launch/editor-demo.tsx`;
await writeFile(entry, `
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {EditEdition} from '../../apps/desktop/src/forms/EditEdition';
${['shell','store','inspection','controls','desktop','catalog','integrations','settings','window-chrome'].map(name => `import '../../apps/desktop/src/styles/${name}.css';`).join('\n')}
const item={id:'demo-copy',editionId:'demo-edition',revision:1,editionRevision:1,editionCopyCount:1,coverAssetId:null,modelAssetId:null,source:null,addedAt:'',edition:{categoryId:'music',title:'夜航 / Night Voyage',creator:'Atelier Ensemble',editionLabel:'CD + DVD',barcode:'',catalogNumber:'',media:[{carrierId:'cd',label:'CD'},{carrierId:'dvd',label:'DVD'}]},copy:{status:'owned',acquiredAt:'',amountMinor:null,currency:'CNY',seller:'',purchaseUrl:'',storageLocation:'',notes:''}};
mockIPC(command=>{
 if(command==='netease_albums')return [];
 if(command==='library_content')return {genres:['Electronic'],styles:['Ambient'],notes:'夜晚的街道，缓慢行进的声音。',detailsLoaded:true,companies:[],credits:[{name:'Atelier Ensemble',anv:'',role:'Composed By',tracks:''}],tracks:[{title:'夜航',position:'1',duration:'4:12',type_:'track',disc_number:1,sub_tracks:[],extraartists:[]},{title:'远方的灯',position:'2',duration:'3:48',type_:'track',disc_number:1,sub_tracks:[],extraartists:[]},{title:'演出影像',position:'1',duration:'28:00',type_:'track',disc_number:2,sub_tracks:[],extraartists:[]}]};
 throw Error(command);
});
createRoot(document.getElementById('root')).render(<EditEdition item={item} categories={[{id:'music',label:'音乐'}]} carriers={[{id:'cd',label:'CD'},{id:'dvd',label:'DVD'}]} onClose={()=>{}} onSaved={()=>{}}/>);
`);
const server=await createServer({root:`${root}/apps/desktop`,configFile:`${root}/apps/desktop/vite.config.ts`,server:{port:0,strictPort:false,fs:{allow:[root]}},plugins:[{name:'product-editor',configureServer(server){server.middlewares.use('/product-editor',async(_,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/product-editor',`<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/@fs/${entry}"></script></html>`));});}}]});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100},reducedMotion:'reduce'});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/product-editor`);
 await page.getByRole('button',{name:'资料',exact:true}).click();
 await page.getByText('夜航',{exact:true}).count();
 await page.locator('textarea').first().waitFor();
 await page.screenshot({path:path.join(root,'artifacts/product-launch/editor-demo.png')});
}finally{await browser.close();await server.close();}
