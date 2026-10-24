import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import { discogs, type ImportPreview, type MetadataRelease, type MetadataResults, type MetadataSearch } from './gateway';
import { ReleasePreview } from './ReleasePreview';
import { AddCopy } from '../forms/AddCopy';
import type { Descriptor } from '../library/types';
import { enter } from '../ui/motion';
import { SourceLink } from './SourceLink';
import { SearchCover } from './SearchCover';
import { MobileReceive } from '../mobile/MobileReceive';
import { NeteaseBrowser } from '../integrations/NeteaseBrowser';
import type { MusicSupplement } from '../integrations/gateway';

type SearchMode = 'barcode' | 'catalog' | 'keyword' | 'release';
function detectMode(value: string): SearchMode {
  const query = value.trim();
  if (/^\d{8,14}$/.test(query)) return 'barcode';
  if (/^\d{1,7}$/.test(query)) return 'release';
  if (/[A-Za-z]/.test(query) && /\d/.test(query) && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(query)) return 'catalog';
  return 'keyword';
}

export function DiscogsBrowser({ categoryId, categories, carriers, onSaved, onClose, onSettings }: {
  categoryId: string; categories: Descriptor[]; carriers: Descriptor[];
  onSaved(id: string, categoryId: string): Promise<void>; onClose(): void; onSettings(): void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'auto' | SearchMode>('auto');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [neteaseOpen, setNeteaseOpen] = useState(false);
  const [neteaseSeed, setNeteaseSeed] = useState<MusicSupplement | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [submitted, setSubmitted] = useState<MetadataSearch | null>(null);
  const [results, setResults] = useState<MetadataResults | null>(null);
  const [release, setRelease] = useState<MetadataRelease | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<ImportPreview | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const resultList = useRef<HTMLDivElement>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const releaseExpiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(expiry.current); clearTimeout(releaseExpiry.current); };
  }, []);
  useEffect(() => { enter(content.current, 0); }, [release, results, imported]);
  useEffect(() => { resultList.current?.scrollTo(0, 0); }, [results]);
  function fresh(scope: 'results' | 'release') {
    if (!mounted.current) return;
    // Opening a release must not extend the lifetime of the retained search page.
    const timer = scope === 'results' ? expiry : releaseExpiry;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (scope === 'results') { setResults(null); setSubmitted(null); }
      else setRelease(null);
      setError('资料已过期，请重新查询。');
    }, 6 * 60 * 60 * 1000);
  }
  async function load(id: number) {
    setBusy(true); setError('');
    try { const value = await discogs.release(id); if (mounted.current) { setRelease(value); fresh('release'); } }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  async function search(request: MetadataSearch) {
    setBusy(true); setError(''); setRelease(null); clearTimeout(releaseExpiry.current);
    try { setResults(await discogs.search(request)); setSubmitted(request); fresh('results'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  if (imported) return <AddCopy categoryId={categoryId} categories={categories} carriers={carriers} imported={imported}
    importTracks={release?.tracklist || []}
    onBack={() => setImported(null)} onClose={onClose} onSaved={onSaved}/>;
  if (neteaseSeed) return <AddCopy categoryId={categoryId} categories={categories} carriers={carriers} initialMusic={neteaseSeed}
    onBack={() => setNeteaseSeed(null)} onClose={onClose} onSaved={onSaved}/>;
  return <><Modal title="Discogs" onClose={onClose} wide busy={busy} className="metadata-browser-panel">
    <div className="metadata-toolbar">
      {release ? <button type="button" className="text-button" disabled={busy} onClick={() => setRelease(null)}>返回搜索</button> :
        <button type="button" className="text-button" disabled={busy} onClick={onSettings}>设置</button>}
      {!release && <div className="metadata-toolbar-actions">
        <button type="button" className="text-button" disabled={busy} onClick={() => setManualOpen(true)}>手动录入</button>
        {categoryId === 'music' && <button type="button" className="text-button" disabled={busy} onClick={() => setNeteaseOpen(true)}>从网易云添加</button>}
        <button type="button" className="text-button" disabled={busy} onClick={() => setMobileOpen(true)}>手机扫条码</button>
      </div>}
    </div>
    <>
      {!release && <form className="metadata-search" onSubmit={event => {
        event.preventDefault(); if (busy) return;
        const detected = mode === 'auto' ? detectMode(query) : mode;
        if (detected === 'release') {
          if (!/^[1-9]\d*$/.test(query) || !Number.isSafeInteger(Number(query))) { setError('请输入有效的发行 ID。'); return; }
          void load(Number(query));
        } else { setResults(null); void search({ mode: detected, query, page: 1 }); }
      }}>
        <Select label="Discogs 搜索方式" value={mode} options={[{ id: 'auto', label: '自动' }, { id: 'barcode', label: '条码' }, { id: 'catalog', label: '品番' }, { id: 'keyword', label: '关键词' }, { id: 'release', label: '发行 ID' }]}
          onChange={value => setMode(value as 'auto' | SearchMode)} disabled={busy}/>
        <input aria-label="Discogs 搜索内容" value={query} onChange={event => setQuery(event.target.value)} disabled={busy} spellCheck={false}
          placeholder="输入条码、品番、关键词或发行 ID"/>
        <button className="solid-button" disabled={busy || !query.trim()}>{busy ? '查询中' : '查询'}</button>
      </form>}
      {(!release || error) && <p className="form-error" role="alert">{error}</p>}
      <div ref={content} className="metadata-search-body">{release ? <><ReleasePreview key={release.id} release={release}/>
        <footer className="form-footer release-footer"><SourceLink id={release.id} button/><button type="button" className="solid-button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { setImported(await discogs.prepareImport(release.id, categoryId)); }
          catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
        }}>{busy ? '读取中' : '选择此版本'}</button></footer>
      </> : results && <>
        <div className="metadata-results" ref={resultList} role="region" aria-label="搜索结果" tabIndex={0}>{results.results.map(item =>
          <article key={item.id}>
            <button type="button" disabled={busy} onClick={() => void load(item.id)}>
              <SearchCover key={`${item.id}:${item.thumb}:${item.cover_image}`} thumb={item.thumb} cover={item.cover_image}/>
              <span className="metadata-result-text"><strong>{item.title}</strong><span>{[item.country, item.year, item.catno, item.format.join(' / ')].filter(Boolean).join(' · ')}</span></span>
            </button>
          </article>)}</div>
        {!results.results.length && <p className="utility-copy">没有匹配的发行</p>}
        {results.pagination.pages > 1 && <div className="metadata-pagination">
          <button type="button" disabled={busy || results.pagination.page <= 1} onClick={() => submitted && void search({ ...submitted, page: results.pagination.page - 1 })}>上一页</button>
          <span>{results.pagination.page} / {Math.max(1, results.pagination.pages)}</span>
          <button type="button" disabled={busy || results.pagination.page >= Math.min(100, results.pagination.pages)} onClick={() => submitted && void search({ ...submitted, page: results.pagination.page + 1 })}>下一页</button>
        </div>}
      </>}</div>
    </>
  </Modal>{mobileOpen && <MobileReceive mode="barcode" onClose={() => setMobileOpen(false)} onReceive={value => {
    if (value.kind === 'barcode') { setQuery(value.value); setError(''); }
  }}/>}{neteaseOpen && <NeteaseBrowser initialQuery={`${query}`.trim()} initialAlbum={null} onClose={() => setNeteaseOpen(false)}
    onConfirm={async album => { setNeteaseOpen(false); setNeteaseSeed(album); }} confirmLabel="使用此资料"/>}{manualOpen && <AddCopy categoryId={categoryId} categories={categories} carriers={carriers}
      onBack={() => setManualOpen(false)} onClose={onClose} onSaved={onSaved}/>}</>;
}
