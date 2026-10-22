import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { video, type VideoImage, type VideoWork } from './gateway';
import { VideoPicture, VideoPictureViewer } from './VideoPicture';

interface Picture { key: string; kind: string; url: string; previewUrl: string; label: string }
export function VideoGallery({ work, enabled = true, onChange, onSave }: { work: VideoWork; enabled?: boolean; onChange?(rows: VideoImage[]): void; onSave?(rows: VideoImage[]): Promise<void> }) {
  const [rows, setRows] = useState<VideoImage[] | null>(work.images ?? null), [filter, setFilter] = useState('poster');
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [changed, setChanged] = useState(false);
  const [viewing, setViewing] = useState<Picture | null>(null);
  const live = useRef(true), pending = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function load() {
    if (pending.current || work.source === 'bangumi') return;
    pending.current = true; setBusy(true); setError('');
    try { const next = await video.images(work); if (live.current) { setRows(next); setChanged(true); onChange?.(next); } }
    catch (cause) { if (live.current) setError(errorMessage(cause)); }
    finally { pending.current = false; if (live.current) setBusy(false); }
  }
  useEffect(() => { if (enabled && rows === null && work.source !== 'bangumi') void load(); }, [enabled]);
  const pictures: Picture[] = (rows || []).map((row, index) => ({key: row.url, kind: row.kind, url: row.url, previewUrl: row.previewUrl, label: `${row.kind === 'poster' ? '海报' : '剧照'} ${index + 1} · ${row.width} × ${row.height}${row.language ? ` · ${row.language}` : ''}`}));
  if (!rows?.length && work.posterUrl) pictures.unshift({key: 'cover', kind: 'poster', url: work.posterUrl, previewUrl: work.posterUrl, label: '作品封面'});
  for (const chapter of work.chapters || []) if (chapter.imageUrl) pictures.push({key: `episode:${chapter.id}`, kind: 'episode', url: chapter.imageUrl, previewUrl: chapter.imageUrl, label: `${chapter.group} · ${chapter.number} · ${chapter.originalTitle || chapter.title}`});
  const kinds = [{id:'poster', label:'海报'}, {id:'backdrop', label:'剧照'}, {id:'episode', label:'分集图片'}].filter(k => pictures.some(p => p.kind === k.id));
  const active = kinds.some(k => k.id === filter) ? filter : kinds[0]?.id;
  async function save() {
    if (!onSave || !rows || saving) return;
    setSaving(true); setError('');
    try { await onSave(rows); if (live.current) setChanged(false); }
    catch (cause) { if (live.current) setError(errorMessage(cause)); }
    finally { if (live.current) setSaving(false); }
  }
  return <section className="video-gallery" aria-busy={busy || saving}>
    <div className="video-section-heading">
      <span className="setting-hint">{changed && onSave ? '图库预览 · 尚未保存' : '作品图库'}</span>
      <div className="video-heading-actions">
        {onSave && changed && rows && !saving && <button type="button" className="text-button" disabled={busy} onClick={() => void save()}>确认保存此图库</button>}
        {saving && <span className="setting-hint">保存中…</span>}
        {work.source !== 'bangumi' && <button type="button" className="text-button" disabled={busy || saving} onClick={() => void load()}>{busy ? '读取图片中…' : '刷新图库'}</button>}
      </div>
    </div>
    <nav className="disc-tabs" aria-label="图片分类">{kinds.map(kind => <button type="button" key={kind.id} aria-selected={active === kind.id} onClick={() => setFilter(kind.id)}>{kind.label} · {pictures.filter(p => p.kind === kind.id).length}</button>)}</nav>
    <div className={`video-gallery-grid ${active === 'poster' ? 'posters' : ''}`}>{pictures.filter(p => p.kind === active).map(picture => <button type="button" key={picture.key} onClick={() => setViewing(picture)} aria-label={`查看${picture.label}`}><VideoPicture key={picture.previewUrl} src={picture.previewUrl} alt={picture.label}/><small>{picture.label}</small></button>)}</div>
    {!pictures.length && !busy && <p className="utility-copy">此来源暂无图片。</p>}
    {work.source === 'tmdbTv' && !work.chapters && <p className="setting-hint">在章节页获取分集后，可同时浏览分集图片。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {viewing && <VideoPictureViewer url={viewing.url} title={viewing.label} onClose={() => setViewing(null)}/>}
  </section>;
}
