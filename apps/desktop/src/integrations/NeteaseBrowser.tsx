import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../library/gateway';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { time } from '../playback/gateway';
import { netease, type MusicSupplement, type AlbumSearchPage, type AlbumResult } from './gateway';
import { NeteaseCover } from './NeteaseCover';
import { parseNeteaseShare } from './shareLink';

export function NeteaseBrowser({ initialQuery, initialAlbum = null, loading = false, initialError = '', autoSearch = false, onClose, onConfirm, confirmLabel = '保存补充资料', footer }: {
  initialQuery: string; initialAlbum?: MusicSupplement | null; loading?: boolean; initialError?: string; autoSearch?: boolean;
  onClose(): void; onConfirm(album: MusicSupplement): Promise<void>; confirmLabel?: string;
  footer?(album: MusicSupplement): ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AlbumSearchPage | null>(null);
  const [submitted, setSubmitted] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [album, setAlbum] = useState<MusicSupplement | null>(null);
  const [stored, setStored] = useState(false);
  const [busy, setBusy] = useState(false);
  const searched = useRef(false);
  const [error, setError] = useState('');
  const [disc, setDisc] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (initialAlbum) { setAlbum(initialAlbum); setStored(true); setDisc(initialAlbum.tracks[0]?.disc || ''); } }, [initialAlbum]);
  useEffect(() => { if (autoSearch && !searched.current) { searched.current = true; void search(initialQuery); } }, [autoSearch, initialQuery]);
  useEffect(() => { enter(body.current, 0); }, [album?.albumId, disc, results]);
  useEffect(() => { list.current?.scrollTo(0, 0); }, [results]);
  async function run(action: () => Promise<void>) { if (busy || loading) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function search(text: string, offset = 0) {
    await run(async () => {
      const reference = parseNeteaseShare(text);
      if (reference) {
        const value = reference.kind === 'album' ? await netease.album(reference.id) : await netease.songAlbum(reference.id);
        setAlbum(value); setCover(null); setStored(false); setDisc(value.tracks[0]?.disc || '');
        return;
      }
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
  return <Modal title="网易云" onClose={onClose} busy={busy || loading} className="supplement-panel">
    <form className="integration-search" onSubmit={e => { e.preventDefault(); void search(query.trim()); }}>
      {album && results && <button type="button" className="text-button" disabled={busy || loading} onClick={() => { setAlbum(null); setCover(null); setError(''); }}>返回搜索</button>}
      <input aria-label="搜索专辑或读取分享链接" placeholder="专辑、歌手或分享链接" value={query} onChange={e => setQuery(e.target.value)} disabled={busy || loading}/><button className="solid-button" disabled={busy || loading || !query.trim()}>{busy || loading ? '读取中' : '读取'}</button>
    </form>
    <div className="supplement-body" ref={body}>
      {album ? <><section className="supplement-description">{cover && <NeteaseCover url={cover} large/>}<h3>{album.title}</h3><p>{album.artists.join(' / ')}</p><p className="setting-hint">{album.company} {album.publishedAt ? new Date(album.publishedAt).toLocaleDateString('zh-CN') : ''}</p><p className="album-description">{album.description}</p></section>
        <section className="supplement-tracks"><nav className="detail-tabs" aria-label="分盘">{discs.map(d => <button key={d} className={d === disc ? 'active' : ''} onClick={() => setDisc(d)}>Disc {d}</button>)}</nav>
          <div className="supplement-track-scroll">{album.tracks.filter(t => t.disc === disc).map(t => <div className="supplement-track" key={t.id}><span>{t.number}</span><strong>{t.title}</strong><time>{time(t.durationMs / 1000)}</time></div>)}</div>
        </section></> : <div className="integration-results" ref={list} role="region" aria-label="专辑搜索结果" tabIndex={0} aria-busy={busy}>
          {results?.items.map(row => <button key={row.id} disabled={busy || loading} onClick={() => void open(row)}>
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
      {album && <div className="netease-album-actions">{stored && footer?.(album)}
        <button className="solid-button" disabled={busy || loading || stored} onClick={() => void run(async () => { await onConfirm(album); setStored(true); })}>{stored ? '已保存' : confirmLabel}</button></div>}
    </footer>
    <p className="form-error" role="alert">{error || initialError}</p>
  </Modal>;
}
