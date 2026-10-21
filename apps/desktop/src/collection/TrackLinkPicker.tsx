import { useState } from 'react';
import { AlbumTabs } from '../integrations/AlbumTabs';
import { Modal } from '../ui/Modal';
import type { LibraryCopy } from '../library/types';
import type { ReleaseTrack } from '../metadata/gateway';
import { netease, type LinkedMusicAlbum, type NeteaseSong } from '../integrations/gateway';
import { parseNeteaseShare } from '../integrations/shareLink';
import { errorMessage } from '../library/gateway';
import { time } from '../playback/gateway';

export function TrackLinkPicker({ item, track, positionLabel, albums, current, onClose, onSaved }: {
  item: LibraryCopy; track: ReleaseTrack; positionLabel: string; albums: LinkedMusicAlbum[]; current?: NeteaseSong;
  onClose(): void; onSaved(): Promise<void>;
}) {
  const [selected, setSelected] = useState<number>();
  const album = (albums.find(a => a.album.albumId === selected) || albums[0])?.album;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<NeteaseSong | null>(null);
  async function read() {
    if (busy) return;
    setBusy(true); setError(''); setPreview(null);
    try {
      const reference = parseNeteaseShare(query);
      if (!reference || reference.kind !== 'song') throw new Error('请粘贴网易云歌曲分享链接。');
      setPreview(await netease.song(reference.id));
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function select(id: number | null) {
    if (busy) return;
    setBusy(true); setError('');
    try { await netease.link(item.editionId, item.editionRevision, track.position, track.title, id); await onSaved(); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Modal title="关联曲目" onClose={onClose} busy={busy} className="track-link-panel">
    <p className="track-link-title">{positionLabel} · {track.title}</p>
    {current && <p className="setting-hint">已关联：{current.title} · {current.artists.join(' / ')}</p>}
    <form className="integration-search" onSubmit={e => { e.preventDefault(); void read(); }}>
      <input aria-label="网易云歌曲分享链接" placeholder="粘贴歌曲分享链接，无需关联专辑" value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setPreview(null); }}/>
      <button className="solid-button" disabled={busy || !query.trim()}>{busy ? '处理中' : '读取'}</button>
    </form>
    {preview && <section className="song-link-preview" aria-live="polite"><div><strong>{preview.title}</strong><small>{preview.artists.join(' / ')} · {time(preview.durationMs / 1000)}</small></div><button className="solid-button" disabled={busy} onClick={() => void select(preview.id)}>关联这首歌</button></section>}
    {!!album?.tracks.length && <p className="setting-hint">也可从已关联专辑中选择</p>}
    {albums.length > 1 && <AlbumTabs albums={albums} selected={album?.albumId} onChange={setSelected} disabled={busy}/>}
    <div className="track-link-list">{album?.tracks.map(t => <button key={t.id} disabled={busy} onClick={() => void select(t.id)}><span>{t.disc} · {t.number}</span><strong>{t.title}</strong><time>{time(t.durationMs / 1000)}</time></button>)}</div>
    <footer><button className="text-button" disabled={busy} onClick={() => void select(null)}>{album ? '恢复自动匹配' : '解除关联'}</button></footer>
    <p className="form-error" role="alert">{error}</p>
  </Modal>;
}
