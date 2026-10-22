import { BrowserMultiFormatOneDReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { readPurchaseImage, type PurchaseImage } from '../src/forms/purchase/images';
import { validBarcode } from '../src/mobile/barcode';
import './style.css';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const message = element('message'), send = element<HTMLButtonElement>('send'), barcode = element<HTMLInputElement>('barcode');
const token = location.hash.slice(1);
let info: { mode: 'barcode' | 'screenshots'; maxImages: number; requestId: string } | null = null;
let images: PurchaseImage[] = [], busy = false, sent = false, sequence = 0;
let reading: AbortController | null = null;
const status = (text: string) => { message.textContent = text; };
async function request(route: string, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(route, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: 'no-store' });
    const value = await response.json();
    if (!response.ok) throw Error(value.message || '连接未完成，请回到电脑重新连接');
    return value;
  } finally { clearTimeout(timer); }
}
function update() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy || sent || !info;
  const cancel = element<HTMLButtonElement>('cancel-read');
  cancel.hidden = !reading; cancel.disabled = !reading;
  barcode.disabled = busy || sent;
  send.disabled = busy || sent || !info || (info.mode === 'barcode' ? !validBarcode(barcode.value) : !images.length);
  send.textContent = sent ? '已发送' : busy ? '处理中…' : '发送到电脑';
  element('count').textContent = info ? `${images.length} / ${info.maxImages} 张 · 可以移除后重新选择` : '';
}
function thumbnails() {
  element('thumbnails').replaceChildren(...images.map((image,index) => {
    const wrapper = document.createElement('div'), img = document.createElement('img'), remove = document.createElement('button');
    img.src = image.dataUrl; img.alt = `图片 ${index+1}`;
    remove.type = 'button'; remove.textContent = '移除'; remove.setAttribute('aria-label',`移除截图 ${index+1}`);
    remove.onclick = () => { images = images.filter(entry=>entry.id!==image.id); thumbnails(); update(); };
    wrapper.append(img,remove); return wrapper;
  }));
}
async function add(files: File[]) {
  if (busy || sent || !info || !files.length) return;
  if (files.length+images.length > info.maxImages) { status(`本次最多传 ${info.maxImages} 张，请减少选择`); return; }
  const controller = new AbortController(); reading = controller;
  busy = true; status(`已选择 ${files.length} 张，正在准备…`); update();
  try {
    for (const [index, file] of files.entries()) {
      const image = await readPurchaseImage(file,`phone-${++sequence}`, { signal: controller.signal,
        onProgress: stage => status(`第 ${index + 1} / ${files.length} 张 · ${stage}`) });
      if (controller.signal.aborted) throw Error('已取消读取，已完成的图片仍保留');
      if (images.reduce((sum,item)=>sum+item.dataUrl.length, image.dataUrl.length)>24*1024*1024) throw Error('图片总大小过大，请减少图片');
      images=[...images,image]; thumbnails(); update();
    }
    status('图片已准备好，点击“发送到电脑”。');
  } catch(e) { status(e instanceof Error?e.message:'图片无法读取'); }
  finally {reading=null;busy=false;update();}
}

element('cancel-read').onclick=()=>reading?.abort();
element('choose-images').onclick=()=>element<HTMLInputElement>('screenshots').click();
element('take-image').onclick=()=>element<HTMLInputElement>('camera').click();
element('take-barcode').onclick=()=>element<HTMLInputElement>('barcode-photo').click();
for(const id of ['screenshots','camera']) element<HTMLInputElement>(id).onchange=event=>{
  const input=event.target as HTMLInputElement; const files=[...(input.files||[])];
  void add(files).finally(()=>{input.value='';});
};
barcode.oninput=()=>update();
element<HTMLInputElement>('barcode-photo').onchange=async event=>{
  const input=event.target as HTMLInputElement, file=input.files?.[0];if(!file||busy||sent)return;
  const controller = new AbortController(); reading = controller;
  busy=true;status('正在识别条码…');update();
  try {
    const image=await readPurchaseImage(file,`barcode-${++sequence}`, { signal: controller.signal, onProgress: status });
    if (controller.signal.aborted) throw Error('已取消条码读取');
    const hints=new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.UPC_A,BarcodeFormat.EAN_8]],[DecodeHintType.TRY_HARDER,true]]);
    const reader=new BrowserMultiFormatOneDReader(hints);
    const result=await reader.decodeFromImageUrl(image.dataUrl);
    const value=result.getText();
    if(!validBarcode(value))throw Error('条码校验未通过，请重拍或手动输入');
    barcode.value=value;status('已识别，请核对条码数字后发送。');
  }catch(e){ status(e instanceof Error && /^(请选择|单张|截图|条码|已取消|读取|图片|无法读取)/.test(e.message)?e.message:'未读出条码，请靠近、对焦后重拍，或手动输入条码数字。'); }
  finally{input.value='';reading=null;busy=false;update();}
};
send.onclick=async()=>{
  if(send.disabled||!info)return;busy=true;status('正在发送…');update();
  try {
    const payload=info.mode==='barcode'?{kind:'barcode',value:barcode.value}:{kind:'screenshots',images:images.map(image=>image.dataUrl)};
    await request('/api/submit',{id:info.requestId,payload});
    sent=true;images=[];thumbnails();element('connection').textContent='已发送';status('已发送到电脑，请回到电脑核对。本次连接随后关闭。');
  }catch(e){status(e instanceof Error?`${e.message}；如果电脑已收到，请勿重复发送。`:'发送未完成，请检查电脑是否已收到');}
  finally{busy=false;update();}
};
async function connect(){
  try {
    if(!/^[a-f0-9]{64}$/.test(token))throw Error('请使用电脑显示的完整二维码打开本页');
    info=await request('/api/session');
    if(!info)throw Error('连接信息缺失');
    element('connection').textContent='已连接';element('title').textContent=info.mode==='barcode'?'把条码带回收藏':'把图片传到电脑';
    element('subtitle').textContent=info.mode==='barcode'?'拍清条码，核对数字，再交给电脑搜索。':`本次可传 ${info.maxImages} 张，AI 识别由你在电脑上确认。`;
    element(info.mode==='barcode'?'barcode-panel':'images-panel').hidden=false;
  }catch(e){element('connection').textContent='未连接';status(e instanceof Error?e.message:'无法连接，请确认同一 Wi-Fi 并重新扫码');}
  update();
}
void connect();
