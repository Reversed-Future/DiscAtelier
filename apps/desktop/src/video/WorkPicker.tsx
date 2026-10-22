import { VideoGallery } from './VideoGallery';
import { workKey, workSourceName } from './sources';
import { VideoChapters } from './VideoChapters';
import { workTitles } from './titles';
import { useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import { video, posterUrl, type VideoSource, type VideoWork } from './gateway';
import { WorkCard } from './WorkCard';
export function WorkPicker({ initialQuery, existingWorks = [], onPick, onClose }: { initialQuery: string; existingWorks?: VideoWork[]; onPick(work: VideoWork): void; onClose(): void }) {
  const [source, setSource] = useState<VideoSource>('bangumi'), [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<Awaited<ReturnType<typeof video.search>> | null>(null), [selected, setSelected] = useState<VideoWork | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const searched = useRef({ source, query });
  const [previewTab, setPreviewTab] = useState('info');
  async function search(page = 1) {
    if (busy) return;
    setBusy(true); setError('');
    const request = page === 1 ? { source, query } : searched.current;
    try { setResult(await video.search(request.source, request.query, page)); searched.current = request; setSelected(null); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Modal title="查找作品" onClose={onClose} busy={busy} wide className="video-browser-panel">
    <div className="video-browser">
      {!selected ? <><div className="video-search"><Select label="作品来源" value={source} options={[{ id: 'bangumi', label: 'Bangumi' }, { id: 'tmdbMovie', label: 'TMDB 电影' }, { id: 'tmdbTv', label: 'TMDB 剧集' }]} disabled={busy} onChange={s => { setSource(s as VideoSource); setResult(null); }}/>
        <input aria-label="作品名称或链接" value={query} disabled={busy} placeholder="作品名，或粘贴 TMDB / Bangumi 链接" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}/>
        <button type="button" className="solid-button" disabled={busy || !query.trim()} onClick={() => void search()}>{busy ? '读取中' : '查询'}</button></div>
        <div className="video-results">{result?.items.map(w => <button type="button" className="video-result" key={`${w.source}:${w.externalId}`} disabled={busy} onClick={async () => {
          setBusy(true); setError(''); try { const next = await video.work(w.source, w.externalId); const previous = existingWorks.find(saved => workKey(saved) === workKey(next)); setSelected({...next, chapters: previous?.chapters ?? next.chapters, images: previous?.images ?? next.images}); setPreviewTab('info'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
        }}>{posterUrl(w) && <img src={posterUrl(w)} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<span><strong>{workTitles(w).title}</strong><small>{[workTitles(w).subtitle, w.premiereDate].filter(Boolean).join(' · ')}</small><small>{w.summary.slice(0, 160)}</small></span></button>)}
        {result && !result.items.length && <p className="form-note">未找到作品。可更换原名搜索，或返回手动填写实体资料。</p>}
        {!result && <p className="form-note">先确定作品，再核对你手中的实体版本。条码和品番不会用于猜测作品。</p>}</div>
        {result && <div className="video-pagination"><button type="button" disabled={busy || result.page <= 1} onClick={() => void search(result.page - 1)}>上一页</button><span>{result.page}</span><button type="button" disabled={busy || !result.hasMore} onClick={() => void search(result.page + 1)}>下一页</button></div>}</>
      : <><button type="button" className="text-button" onClick={() => setSelected(null)}>返回结果</button>
        <nav className="disc-tabs" aria-label="作品预览"><button type="button" aria-selected={previewTab === 'info'} onClick={() => setPreviewTab('info')}>资料</button><button type="button" aria-selected={previewTab === 'chapters'} onClick={() => setPreviewTab('chapters')}>章节</button><button type="button" aria-selected={previewTab === 'gallery'} onClick={() => setPreviewTab('gallery')}>图库</button></nav>
        <div className="video-results">
          <div hidden={previewTab !== 'info'}><WorkCard work={selected}/></div>
          <div hidden={previewTab !== 'chapters'}><VideoChapters key={workKey(selected)} work={selected} enabled={previewTab === 'chapters'} onChange={chapters => setSelected(current => current ? {...current, chapters} : current)}/></div>
          <div hidden={previewTab !== 'gallery'}><VideoGallery key={workKey(selected)} work={selected} enabled={previewTab === 'gallery'} onChange={images => setSelected(current => current ? {...current, images} : current)}/></div>
        </div>
        <p className="form-note">{existingWorks.length ? `${existingWorks.some(w => workKey(w) === workKey(selected)) ? '更新' : '追加'} ${workSourceName(selected)} 的作品资料；其他来源、实体资料和收藏封面保留。` : '这是作品资料；实体发行和本版收录需单独核对。'} 核对后加入编辑草稿，保存版本才会生效。</p>
        <footer className="form-footer"><button type="button" className="solid-button" onClick={() => onPick(selected)}>{existingWorks.length ? '确认合并 · 暂不保存' : '使用此作品 · 暂不保存'}</button></footer></>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
