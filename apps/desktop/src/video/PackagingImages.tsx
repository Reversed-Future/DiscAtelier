import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { MobileReceive } from '../mobile/MobileReceive';
import { readPurchaseImage, MAX_IMAGES, type PurchaseImage } from '../forms/purchase/images';
import { errorMessage } from '../library/gateway';
import type { CoverChange, EditionDraft } from '../library/types';
import { video, type VideoMetadata, type Recognition } from './gateway';
import { applyPackaging, currentPackaging, packagingLabels } from './packaging';

export function PackagingImages({ edition, metadata, onApply, onCover, onClose }: {
  edition: EditionDraft; metadata: VideoMetadata; onApply(edition: EditionDraft, metadata: VideoMetadata): void; onCover(value: CoverChange): void; onClose(): void;
}) {
  const [pictures, setPictures] = useState<PurchaseImage[]>([]), [mobile, setMobile] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [result, setResult] = useState<Recognition | null>(null), [checked, setChecked] = useState<string[]>([]);
  const [coverId, setCoverId] = useState('');
  const input = useRef<HTMLInputElement>(null), root = useRef<HTMLDivElement>(null), lock = useRef(false), controller = useRef<AbortController | null>(null);
  const images = useRef(pictures); images.current = pictures;
  useEffect(() => () => controller.current?.abort(), []);
  async function add(files: File[]) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus('正在准备图片…');
    controller.current = new AbortController();
    try {
      if (images.current.length + files.length > MAX_IMAGES) throw Error('一次最多上传 6 张图片。');
      const loaded: PurchaseImage[] = [];
      for (const file of files) loaded.push(await readPurchaseImage(file, crypto.randomUUID(), { signal: controller.current.signal, onProgress: setStatus }));
      const all = [...images.current, ...loaded];
      if (all.reduce((n, p) => n + p.dataUrl.length, 0) > 24 * 1024 * 1024) throw Error('图片总量超过 24 MB，请减少图片。');
      setPictures(all); setResult(null); setStatus(`已准备 ${all.length} 张图片`);
    } catch (e) { setError(errorMessage(e)); setStatus(''); } finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (mobile || event.defaultPrevented || !root.current?.closest('dialog')?.contains(event.target as Node)) return;
      const files = [...(event.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); void add(files); }
    }
    document.addEventListener('paste', paste); return () => document.removeEventListener('paste', paste);
  }, [mobile]);
  return <><Modal title="识别实体包装" onClose={onClose} busy={busy} wide className="video-browser-panel">
    <div className="video-packaging" ref={root}>
      <p className="form-note">粘贴或上传正面、背面、腰封。点击识别后，图片才会发送至设置中的 AI 接口；结果需逐项核对。</p>
      <div className="video-actions"><button type="button" disabled={busy || pictures.length >= MAX_IMAGES} onClick={() => input.current?.click()}>选择图片</button><button type="button" disabled={busy || pictures.length >= MAX_IMAGES} onClick={() => setMobile(true)}>手机上传</button>
        <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) void add(files); }}/>
        <button type="button" className="solid-button" disabled={busy || !pictures.length} onClick={async () => {
          if (lock.current) return; lock.current = true; setBusy(true); setError(''); setStatus('正在识别包装…'); setResult(null);
          try { const value = await video.recognize(pictures.map(p => p.dataUrl)); setResult(value); setChecked([]); setStatus('请勾选要填写的字段'); } catch (e) { setError(errorMessage(e)); setStatus(''); } finally { lock.current = false; setBusy(false); }
        }}>{busy ? '处理中' : '识别包装'}</button></div>
      <div className="video-results"><div className="packaging-thumbnails">{pictures.map((p, i) => <div key={p.id}><img src={p.dataUrl} alt={`包装图片 ${i + 1}`}/><span>图片 {i + 1}</span><label><input type="radio" name="packaging-cover" checked={coverId === p.id} disabled={busy} onChange={() => setCoverId(p.id)}/>用作实体封面</label><button type="button" className="text-button" disabled={busy} onClick={() => { setPictures(pictures.filter(v => v.id !== p.id)); setResult(null); if (coverId === p.id) setCoverId(''); }}>移除</button></div>)}</div>
      {coverId && <button type="button" className="text-button" onClick={() => setCoverId('')} disabled={busy}>取消更换封面</button>}
      {result && <section className="packaging-review"><h4>核对识别结果</h4>{result.warning && <p className="form-note">{result.warning}</p>}{!result.fields.length && <p className="form-note">没有可确认的字段，请换一张清晰的图片或手动填写。</p>}
        {result.fields.map(f => <label key={f.key}><input type="checkbox" checked={checked.includes(f.key)} onChange={e => setChecked(e.target.checked ? [...checked, f.key] : checked.filter(k => k !== f.key))}/><span><strong>{packagingLabels[f.key]}</strong><span>{currentPackaging(edition, metadata, f.key) || '未填写'} → {f.value}</span><small>图片 {f.image} · {f.evidence}</small></span></label>)}</section>}</div>
      <p role="status" className="form-note">{status}</p>{error && <p className="form-error" role="alert">{error}</p>}
      <footer className="form-footer"><button type="button" className="solid-button" disabled={busy || (!checked.length && !coverId)} onClick={() => {
        const next = applyPackaging(edition, metadata, result?.fields.filter(f => checked.includes(f.key)) || []);
        const cover = pictures.find(p => p.id === coverId); if (cover) onCover({ action: 'replace', dataUrl: cover.dataUrl });
        onApply(next.edition, next.metadata); onClose();
      }}>填写已选项 · 暂不保存</button></footer>
    </div>
  </Modal>{mobile && <MobileReceive mode="screenshots" maxImages={MAX_IMAGES - pictures.length} onClose={() => setMobile(false)} onReceive={payload => {
    if (payload.kind !== 'screenshots') return;
    // The shared mobile bridge already validates and re-encodes these images.
    // Keep data URLs directly, as with purchase screenshots; no CSP-blocked fetch.
    const next = [...images.current, ...payload.images.map((dataUrl, i) => ({ id: crypto.randomUUID(), name: `手机包装 ${i + 1}`, dataUrl }))];
    if (next.length > MAX_IMAGES || next.reduce((size, p) => size + p.dataUrl.length, 0) > 24 * 1024 * 1024) {
      setError('图片总量超过限制，请减少图片。'); return;
    }
    setPictures(next); setResult(null); setStatus(`已准备 ${next.length} 张图片`); setError('');
  }}/>}</>;
}
