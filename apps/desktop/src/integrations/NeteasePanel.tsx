import { useEffect, useRef, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { errorMessage } from '../library/gateway';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { time } from '../playback/gateway';
import { netease, type MusicSupplement, type AlbumSearchPage, type AlbumResult } from './gateway';
import { NeteaseCover } from './NeteaseCover';

export function NeteasePanel({ item, onClose, onSaved }: { item: LibraryCopy; onClose(): void; onSaved(): Promise<void> }) {
  const [query, setQuery] = useState(`${item.edition.title} ${item.edition.creator}`);
  const [results, setResults] = useState<AlbumSearchPage | null>(null);
  const [submitted, setSubmitted] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [album, setAlbum] = useState<MusicSupplement | null>(null);
  const [stored, setStored] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [disc, setDisc] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { let live = true; void netease.saved(item.editionId).then(value => { if (live && value) { setAlbum(value); setStored(true); setDisc(value.tracks[0]?.disc || ''); } }).catch(e => { if (live) setError(errorMessage(e)); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, [item.editionId]);
  useEffect(() => { enter(body.current, 0); }, [album?.albumId, disc, results]);
  useEffect(() => { list.current?.scrollTo(0, 0); }, [results]);
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function search(text: string, offset = 0) {
    await run(async () => {
      const page = await netease.search(text, offset);
      setResults(page); setSubmitted(text); setAlbum(null); setCover(null); setStored(false);
    });
  }
  async function open(row: AlbumResult) {
    await run(async () => {
      const value = await netease.album(row.id);
      setAlbum(value); setCover(row.coverUrl); setStored(false); setDisc(value.tracks[0]?.disc || '');
    });
  }
  const discs = [...new Set(album?.tracks.map(t => t.disc) || [])];
  return <Modal title="网易云" onClose={onClose} busy={busy} className="supplement-panel">
    <form className="integration-search" onSubmit={e => { e.preventDefault(); void search(query.trim()); }}>
      {album && results && <button type="button" className="text-button" disabled={busy} onClick={() => { setAlbum(null); setCover(null); setError(''); }}>返回搜索</button>}
      <input aria-label="搜索专辑" placeholder="专辑或歌手" value={query} onChange={e => setQuery(e.target.value)} disabled={busy}/><button className="solid-button" disabled={busy || !query.trim()}>{busy ? '读取中' : '搜索'}</button>
    </form>
    <div className="supplement-body" ref={body}>
      {album ? <><section className="supplement-description">{cover && <NeteaseCover url={cover} large/>}<h3>{album.title}</h3><p>{album.artists.join(' / ')}</p><p className="setting-hint">{album.company} {album.publishedAt ? new Date(album.publishedAt).toLocaleDateString('zh-CN') : ''}</p><p className="album-description">{album.description}</p></section>
        <section className="supplement-tracks"><nav className="detail-tabs" aria-label="分盘">{discs.map(d => <button key={d} className={d === disc ? 'active' : ''} onClick={() => setDisc(d)}>Disc {d}</button>)}</nav>
          <div className="supplement-track-scroll">{album.tracks.filter(t => t.disc === disc).map(t => <div className="supplement-track" key={t.id}><span>{t.number}</span><strong>{t.title}</strong><time>{time(t.durationMs / 1000)}</time></div>)}</div>
        </section></> : <div className="integration-results" ref={list} role="region" aria-label="专辑搜索结果" tabIndex={0} aria-busy={busy}>
          {results?.items.map(row => <button key={row.id} disabled={busy} onClick={() => void open(row)}>
            <NeteaseCover url={row.coverUrl}/><span className="netease-result-text"><strong>{row.title}</strong><span>{row.artists.join(' / ')}</span></span>
          </button>)}
          {results && !results.items.length && <p className="setting-hint">没有匹配的专辑</p>}
        </div>}
    </div>
    <footer className="integration-footer"><span className="setting-hint">{album ? `网易云 · ${album.albumId}` : results ? `专辑 · ${results.total}` : '专辑'}</span>
      {!album && results && results.total > results.limit && <nav className="netease-pagination" aria-label="搜索分页">
        <button disabled={busy || results.offset === 0} onClick={() => void search(submitted, Math.max(0, results.offset - results.limit))}>上一页</button>
        <span>{Math.floor(results.offset / results.limit) + 1} / {Math.ceil(results.total / results.limit)}</span>
        <button disabled={busy || !results.items.length || results.offset + results.limit >= results.total} onClick={() => void search(submitted, results.offset + results.limit)}>下一页</button>
      </nav>}
      {album && <button className="solid-button" disabled={busy || stored} onClick={() => void run(async () => { await netease.apply(item.editionId, item.editionRevision, album.albumId); setStored(true); await onSaved(); })}>{stored ? '已保存' : '保存补充资料'}</button>}
    </footer>
    <p className="form-error" role="alert">{error}</p>
  </Modal>;
}
