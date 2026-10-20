import { useEffect, useRef, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { errorMessage } from '../library/gateway';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { time } from '../playback/gateway';
import { netease, type MusicSupplement, type AlbumResult } from './gateway';

export function NeteasePanel({ item, onClose, onSaved }: { item: LibraryCopy; onClose(): void; onSaved(): Promise<void> }) {
  const [query, setQuery] = useState(`${item.edition.title} ${item.edition.creator}`);
  const [rows, setRows] = useState<AlbumResult[]>([]);
  const [album, setAlbum] = useState<MusicSupplement | null>(null);
  const [stored, setStored] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [disc, setDisc] = useState('');
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { let live = true; void netease.saved(item.editionId).then(value => { if (live && value) { setAlbum(value); setStored(true); setDisc(value.tracks[0]?.disc || ''); } }).catch(e => { if (live) setError(errorMessage(e)); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, [item.editionId]);
  useEffect(() => { enter(body.current, 3); }, [album?.albumId, disc]);
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  const discs = [...new Set(album?.tracks.map(t => t.disc) || [])];
  return <Modal title="网易云" onClose={onClose} busy={busy} className="supplement-panel">
    <form className="integration-search" onSubmit={e => { e.preventDefault(); void run(async () => { setRows(await netease.search(query)); setAlbum(null); setStored(false); }); }}>
      <input aria-label="搜索专辑" value={query} onChange={e => setQuery(e.target.value)} disabled={busy}/><button className="solid-button" disabled={busy || !query.trim()}>{busy ? '读取中' : '搜索'}</button>
    </form>
    <div className="supplement-body" ref={body}>
      {album ? <><section className="supplement-description"><h3>{album.title}</h3><p>{album.artists.join(' / ')}</p><p className="setting-hint">{album.company} {album.publishedAt ? new Date(album.publishedAt).toLocaleDateString('zh-CN') : ''}</p><p className="album-description">{album.description}</p></section>
        <section className="supplement-tracks"><nav className="detail-tabs" aria-label="分盘">{discs.map(d => <button key={d} className={d === disc ? 'active' : ''} onClick={() => setDisc(d)}>Disc {d}</button>)}</nav>
          <div className="supplement-track-scroll">{album.tracks.filter(t => t.disc === disc).map(t => <div className="supplement-track" key={t.id}><span>{t.number}</span><strong>{t.title}</strong><time>{time(t.durationMs / 1000)}</time></div>)}</div>
        </section></> : <div className="integration-results">{rows.map(row => <button key={row.id} disabled={busy} onClick={() => void run(async () => { const value = await netease.album(row.id); setAlbum(value); setStored(false); setDisc(value.tracks[0]?.disc || ''); })}><strong>{row.title}</strong><span>{row.artists.join(' / ')}</span></button>)}</div>}
    </div>
    <footer className="integration-footer"><span className="setting-hint">{album ? `网易云 · ${album.albumId}` : '专辑资料'}</span>{album && <button className="solid-button" disabled={busy || stored} onClick={() => void run(async () => { await netease.apply(item.editionId, item.editionRevision, album.albumId); setStored(true); await onSaved(); })}>{stored ? '已保存' : '保存补充资料'}</button>}</footer>
    {error && <p className="form-error" role="alert">{error}</p>}
  </Modal>;
}
