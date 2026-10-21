import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CopyDraft } from '../../library/types';
import { errorMessage } from '../../library/gateway';
import { Select } from '../../ui/Select';
import { MAX_IMAGES, readPurchaseImage, type PurchaseImage } from './images';
import type { Recognition } from './recognition';
import { PurchaseReview } from './PurchaseReview';
import '../../styles/purchase-recognition.css';

export function PurchaseScreenshots({ title, creator, value, amount, onChange, setAmount, onBusy }: {
  title: string; creator: string; value: CopyDraft; amount: string;
  onChange(value: CopyDraft): void; setAmount(value: string): void; onBusy(value: boolean): void;
}) {
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [images, setImages] = useState<PurchaseImage[]>([]);
  const [busy, setBusy] = useState<'reading' | 'recognizing' | null>(null);
  const [result, setResult] = useState<Recognition | null>(null);
  const [record, setRecord] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function add(files: File[]) {
    if (locked.current || !files.length) return;
    if (files.length + images.length > MAX_IMAGES) { setError(`每次最多 ${MAX_IMAGES} 张截图，可先移除不需要的图片`); return; }
    locked.current = true; setBusy('reading'); onBusy(true); setError(''); setMessage('');
    try {
      const added: PurchaseImage[] = [];
      for (const file of files) added.push(await readPurchaseImage(file));
      const next = [...images, ...added];
      if (next.reduce((sum, image) => sum + image.dataUrl.length, 0) > 24 * 1024 * 1024) throw Error('截图总大小超出限制，请减少图片');
      setImages(next); setResult(null);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { locked.current = false; setBusy(null); onBusy(false); }
  }

  // Scoped to this purchase form. Text paste elsewhere keeps normal input behavior.
  useEffect(() => {
    const form = root.current?.closest('form');
    const paste = (event: ClipboardEvent) => {
      if (!form || form.closest('dialog') !== (event.target as HTMLElement)?.closest('dialog')) return;
      const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (files.length) { event.preventDefault(); void add(files); }
    };
    form?.addEventListener('paste', paste);
    return () => form?.removeEventListener('paste', paste);
  });

  async function recognize() {
    if (locked.current || !images.length) return;
    locked.current = true; setBusy('recognizing'); onBusy(true); setError(''); setMessage(''); setResult(null);
    try {
      const response = await invoke<Recognition>('purchase_recognize', { request: { title, creator, images: images.map(image => image.dataUrl) } });
      setResult(response); setRecord(0);
      if (!response.records.length) setMessage(response.message || '没有识别到可填写的购物信息，请换一张清晰的订单截图');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { locked.current = false; setBusy(null); onBusy(false); }
  }

  return <section ref={root} className="purchase-screenshots" aria-label="购物截图填写" aria-busy={!!busy}>
    <div className="purchase-recognition-heading"><strong>购物截图填写</strong>
      <button type="button" className="text-button" disabled={!!busy || images.length >= MAX_IMAGES} onClick={() => input.current?.click()}>添加截图</button></div>
    <div className="purchase-paste-area" tabIndex={0}>在这里按 Ctrl+V 粘贴，或添加 1–6 张截图</div>
    <input ref={input} type="file" multiple hidden accept="image/png,image/jpeg,image/webp" aria-label="购物截图文件" onChange={event => {
      const files = [...(event.target.files || [])]; event.target.value = ''; void add(files);
    }}/>
    {!!images.length && <div className="purchase-thumbnails">{images.map((image, index) => <div key={image.id}>
      <img src={image.dataUrl} alt={`截图 ${index + 1}：${image.name}`}/><span>{index + 1}</span>
      <button type="button" disabled={!!busy} aria-label={`移除截图 ${index + 1}`} onClick={() => {
        setImages(current => current.filter(entry => entry.id !== image.id)); setResult(null); setMessage('');
      }}>×</button></div>)}</div>}
    <div className="purchase-recognition-actions"><span>仅点击识别后，将截图发送至设置中的 AI 接口。需支持图片的模型。</span>
      <button type="button" className="text-button" disabled={!!busy || !images.length} onClick={() => void recognize()}>
        {busy === 'reading' ? '读取中…' : busy === 'recognizing' ? '识别中…' : '识别'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div role="status" aria-live="polite">{message && <p className="purchase-notice">{message}</p>}</div>
    {result && result.records.length > 0 && <div className="purchase-recognition-result">
      {result.message && <p className="purchase-notice">{result.message}</p>}
      {result.records.length > 1 ? <Select label="选择购物记录" value={String(record)} options={result.records.map((entry, index) => ({ id: String(index), label: `${index + 1}. ${entry.title}` }))}
        onChange={value => setRecord(Number(value))}/> : <strong>{result.records[0].title}</strong>}
      <PurchaseReview key={record} record={result.records[record]} value={value} amount={amount} onApply={(copy, price) => {
        onChange(copy); setAmount(price); setResult(null); setMessage('已填写表单，可继续修改；点击保存后才写入收藏。');
      }}/>
    </div>}
  </section>;
}
