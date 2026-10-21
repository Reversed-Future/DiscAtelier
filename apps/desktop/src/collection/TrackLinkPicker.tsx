import { useState } from 'react';
import { Modal } from '../ui/Modal';
import type { LibraryCopy } from '../library/types';
import type { ReleaseTrack } from '../metadata/gateway';
import { netease, type MusicSupplement } from '../integrations/gateway';
import { errorMessage } from '../library/gateway';
import { time } from '../playback/gateway';

export function TrackLinkPicker({ item, track, album, onClose, onSaved }: { item: LibraryCopy; track: ReleaseTrack; album: MusicSupplement; onClose(): void; onSaved(): Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function select(id: number | null) {
    if (busy) return;
    setBusy(true); setError('');
    try { await netease.link(item.editionId, item.editionRevision, track.position, track.title, id); await onSaved(); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Modal title="关联曲目" onClose={onClose} busy={busy} className="track-link-panel">
    <p className="track-link-title">{track.position} · {track.title}</p>
    <div className="track-link-list">{album.tracks.map(t => <button key={t.id} disabled={busy} onClick={() => void select(t.id)}><span>{t.disc} · {t.number}</span><strong>{t.title}</strong><time>{time(t.durationMs / 1000)}</time></button>)}</div>
    <footer><button className="text-button" disabled={busy} onClick={() => void select(null)}>恢复自动匹配</button></footer>
    <p className="form-error" role="alert">{error}</p>
  </Modal>;
}
